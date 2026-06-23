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

    fun bind(forward: PortForward) {
        unbind(forward.id)
        if (!forward.enabled || !plugin.teletypeConfig.networkEnabled) return
        try {
            val ss = ServerSocket(forward.externalPort)
            sockets[forward.id] = ss
            executor.submit { accept(ss, forward) }
            plugin.logger.info(
                "[Teletype] Port forward :${forward.externalPort} → :${forward.targetPort}"
            )
        } catch (e: Exception) {
            plugin.logger.warning(
                "[Teletype] Port forward failed to bind :${forward.externalPort} — ${e.message}"
            )
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
                if (!ss.isClosed) plugin.logger.warning(
                    "[Teletype] Forward accept error :${forward.externalPort}: ${e.message}"
                )
            }
        }
    }

    private fun relay(client: Socket, targetPort: Int) {
        client.use {
            try {
                Socket("127.0.0.1", targetPort).use { backend ->
                    val upstream = executor.submit { pipe(client.getInputStream(), backend.getOutputStream()) }
                    pipe(backend.getInputStream(), client.getOutputStream())
                    runCatching { client.close() }
                    runCatching { backend.close() }
                    upstream.get()
                }
            } catch (_: Exception) {}
        }
    }

    private fun pipe(input: InputStream, output: OutputStream) {
        val buf = ByteArray(8192)
        try {
            var n: Int
            while (input.read(buf).also { n = it } != -1) {
                output.write(buf, 0, n)
                output.flush()
            }
        } catch (_: Exception) {}
    }
}
