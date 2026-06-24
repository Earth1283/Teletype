package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.WsMessage
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.bukkit.Bukkit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.TimeUnit

private val json = Json { encodeDefaults = true }
private val activeConsoleSockets = AtomicInteger(0)

suspend fun DefaultWebSocketServerSession.consoleWebSocket(plugin: Teletype) {
    if (!plugin.teletypeConfig.consoleEnabled) {
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Console streaming is disabled"))
        return
    }

    // Browsers cannot send custom WS headers — accept token via query parameter
    val token = call.request.queryParameters["token"]
    if (token == null || plugin.jwtService.verify(token) == null) {
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
        return
    }

    val active = activeConsoleSockets.incrementAndGet()
    if (active > plugin.teletypeConfig.maxWebSocketConnections) {
        activeConsoleSockets.decrementAndGet()
        close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Too many console connections"))
        return
    }

    val collectJob = launch {
        plugin.consoleBroadcaster.flow.collect { line ->
            send(Frame.Text(json.encodeToString(WsMessage(type = "log", payload = line))))
        }
    }

    try {
        for (frame in incoming) {
            if (frame is Frame.Text) {
                val msg = runCatching {
                    Json.decodeFromString<WsMessage>(frame.readText())
                }.getOrNull() ?: continue

                when {
                    msg.type == "command" && msg.payload.isNotBlank() -> {
                        Bukkit.getScheduler().runTask(plugin, Runnable {
                            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), msg.payload)
                        })
                    }
                    msg.type == "tab_complete" && msg.payload.isNotBlank() -> {
                        val completions: List<String> = withContext(Dispatchers.IO) {
                            runCatching {
                                Bukkit.getScheduler().callSyncMethod(plugin) {
                                    runCatching {
                                        val server = Bukkit.getServer()
                                        val map = server.javaClass.getMethod("getCommandMap").invoke(server)
                                            as? org.bukkit.command.CommandMap
                                        map?.tabComplete(Bukkit.getConsoleSender(), msg.payload)
                                            ?: emptyList()
                                    }.getOrDefault(emptyList<String>())
                                }.get(500L, TimeUnit.MILLISECONDS)
                            }.getOrDefault(emptyList())
                        }
                        val payload = json.encodeToString(ListSerializer(String.serializer()), completions)
                        send(Frame.Text(json.encodeToString(WsMessage(type = "tab_complete", payload = payload))))
                    }
                }
            }
        }
    } finally {
        collectJob.cancel()
        activeConsoleSockets.decrementAndGet()
    }
}
