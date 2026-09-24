package io.github.Earth1283.teletype.multiplex

import io.github.Earth1283.teletype.Teletype
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class PortForwardManager(private val plugin: Teletype) {
    private val sockets = ConcurrentHashMap<String, ServerSocket>()
    private val executor: ExecutorService = Executors.newCachedThreadPool { r ->
        Thread(r, "teletype-fwd").also { it.isDaemon = true }
    }

    fun start(forwards: List<PortForward>) {
        if (!plugin.teletypeConfig.networkEnabled) return
        forwards.filter { it.enabled }.forEach { bind(it) }
    }

    fun bind(forward: PortForward): Result<Unit> {
        unbind(forward.id)
        if (!forward.enabled || !plugin.teletypeConfig.networkEnabled) return Result.success(Unit)
        return runCatching {
            val ss = ServerSocket(forward.externalPort)
            sockets[forward.id] = ss
            executor.submit { accept(ss, forward) }
            plugin.logger.info("[Teletype] Port forward :${forward.externalPort} → :${forward.targetPort}")
        }.onFailure { e ->
            plugin.logger.warning("[Teletype] Port forward failed to bind :${forward.externalPort} — ${e.message}")
        }
    }

    fun unbind(id: String) {
        sockets.remove(id)?.runCatching { close() }
    }

    fun shutdown() {
        sockets.values.forEach { runCatching { it.close() } }
        sockets.clear()
        executor.shutdownNow()
    }

    private fun accept(ss: ServerSocket, forward: PortForward) {
        while (!ss.isClosed) {
            try {
                val client = ss.accept()
                executor.submit { relay(client, forward.targetPort) }
            } catch (e: Exception) {
                if (!ss.isClosed) plugin.logger.warning("[Teletype] Forward accept error :${forward.externalPort}: ${e.message}")
            }
        }
    }

    private fun relay(client: Socket, targetPort: Int) {
        client.use {
            try {
                Socket("127.0.0.1", targetPort).use { backend ->
                    client.tcpNoDelay = true
                    backend.tcpNoDelay = true
                    val closeBoth = { runCatching { client.close() }; runCatching { backend.close() }; Unit }
                    val upstream = executor.submit { pipe(client.getInputStream(), backend.getOutputStream(), closeBoth) }
                    pipe(backend.getInputStream(), client.getOutputStream(), closeBoth)
                    upstream.get()
                }
            } catch (_: Exception) {}
        }
    }

    private fun pipe(input: InputStream, output: OutputStream, onDone: () -> Unit) {
        val buf = ByteArray(16 * 1024)
        try {
            while (true) {
                val n = input.read(buf)
                if (n == -1) break
                output.write(buf, 0, n)
                output.flush()
            }
        } catch (_: Exception) {
        } finally {
            onDone()
        }
    }
}
