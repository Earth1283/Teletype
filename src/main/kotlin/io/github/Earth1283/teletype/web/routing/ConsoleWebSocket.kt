package io.github.Earth1283.teletype.web.routing

import com.auth0.jwt.interfaces.DecodedJWT
import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.console.ConsoleBroadcaster
import io.github.Earth1283.teletype.console.ConsoleLine
import io.github.Earth1283.teletype.util.TeletypeCommandOrigin
import io.github.Earth1283.teletype.util.onServerThread
import io.github.Earth1283.teletype.web.model.WsMessage
import io.ktor.server.plugins.origin
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import org.bukkit.Bukkit
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

private val json = Json { encodeDefaults = false; ignoreUnknownKeys = true }
private val stringList = ListSerializer(String.serializer())
private val activeConsoleSockets = AtomicInteger(0)
private const val LOG_BATCH_WINDOW_MS = 40L
private const val MAX_LOG_BATCH = 500
private const val PENDING_LINE_BUFFER = 4096
private const val TAB_COMPLETE_TIMEOUT_MS = 500L

private val UNAUTHORIZED = CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized")

object ConsoleSessions {
    private val sessions = ConcurrentHashMap.newKeySet<DefaultWebSocketServerSession>()

    fun add(session: DefaultWebSocketServerSession) = sessions.add(session)
    fun remove(session: DefaultWebSocketServerSession) = sessions.remove(session)

    fun closeAllUnauthorized(plugin: Teletype) {
        val toClose = sessions.toList()
        plugin.pluginScope.launch { toClose.forEach { runCatching { it.close(UNAUTHORIZED) } } }
    }
}

suspend fun DefaultWebSocketServerSession.consoleWebSocket(plugin: Teletype) {
    if (!plugin.teletypeConfig.consoleEnabled) {
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Console streaming is disabled"))
        return
    }

    val authMsg = receiveMessage()?.takeIf { it.type == "auth" && it.payload.isNotBlank() } ?: return close(UNAUTHORIZED)
    val token = plugin.jwtService.verify(authMsg.payload) ?: return close(UNAUTHORIZED)

    if (activeConsoleSockets.incrementAndGet() > plugin.teletypeConfig.maxWebSocketConnections) {
        activeConsoleSockets.decrementAndGet()
        close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Too many console connections"))
        return
    }

    val broadcaster = plugin.consoleBroadcaster
    val resumeAfterSeq = if (authMsg.epoch == broadcaster.epoch) authMsg.seq ?: -1 else -1
    val actor = token.subject ?: "unknown"
    val ip = call.request.origin.remoteAddress

    ConsoleSessions.add(this)
    val expiryJob = launch { closeWhenExpired(token) }
    val streamJob = launch { streamLogs(broadcaster, resumeAfterSeq) }

    try {
        while (true) {
            val msg = receiveMessage() ?: break
            if (msg.payload.isBlank()) continue
            when (msg.type) {
                "command" -> {
                    dispatchConsoleCommand(plugin, msg.payload)
                    plugin.auditAsync("console_command", msg.payload, actor, ip)
                }
                "tab_complete" -> {
                    val completions = tabComplete(plugin, msg.payload)
                    send(Frame.Text(json.encodeToString(WsMessage("tab_complete", json.encodeToString(stringList, completions)))))
                }
            }
        }
    } finally {
        streamJob.cancel()
        expiryJob.cancel()
        ConsoleSessions.remove(this)
        activeConsoleSockets.decrementAndGet()
    }
}

private suspend fun DefaultWebSocketServerSession.receiveMessage(): WsMessage? {
    while (true) {
        val frame = incoming.receiveCatching().getOrNull() ?: return null
        if (frame !is Frame.Text) continue
        runCatching { json.decodeFromString<WsMessage>(frame.readText()) }.getOrNull()?.let { return it }
    }
}

private suspend fun DefaultWebSocketServerSession.closeWhenExpired(token: DecodedJWT) {
    val expiresAt = token.expiresAt?.time ?: return
    delay((expiresAt - System.currentTimeMillis()).coerceAtLeast(0))
    close(UNAUTHORIZED)
}

private suspend fun DefaultWebSocketServerSession.streamLogs(broadcaster: ConsoleBroadcaster, resumeAfterSeq: Long) {
    val pending = Channel<ConsoleLine>(PENDING_LINE_BUFFER, BufferOverflow.DROP_OLDEST)
    launch {
        broadcaster.flow.collect { if (it.seq > resumeAfterSeq) pending.send(it) }
    }
    while (true) {
        val batch = mutableListOf(pending.receive())
        delay(LOG_BATCH_WINDOW_MS)
        while (batch.size < MAX_LOG_BATCH) batch += pending.tryReceive().getOrNull() ?: break
        val message = WsMessage(
            type = "log_batch",
            payload = json.encodeToString(stringList, batch.map { it.text }),
            seq = batch.last().seq,
            epoch = broadcaster.epoch,
        )
        send(Frame.Text(json.encodeToString(message)))
    }
}

private fun dispatchConsoleCommand(plugin: Teletype, command: String) {
    Bukkit.getScheduler().runTask(plugin, Runnable {
        TeletypeCommandOrigin.run { Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command) }
    })
}

private suspend fun tabComplete(plugin: Teletype, partial: String): List<String> =
    withTimeoutOrNull(TAB_COMPLETE_TIMEOUT_MS) {
        plugin.onServerThread {
            runCatching { Bukkit.getCommandMap().tabComplete(Bukkit.getConsoleSender(), partial) }.getOrNull()
        }
    } ?: emptyList()
