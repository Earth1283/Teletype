package io.github.Earth1283.teletype.multiplex

import io.github.Earth1283.teletype.Teletype
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.Properties
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class PortMultiplexer(private val plugin: Teletype) {

    private var serverSocket: ServerSocket? = null
    private var executor: ExecutorService? = null

    fun install() {
        val publicPort = plugin.teletypeConfig.multiplexPort
        val gamePort   = plugin.server.port   // port Minecraft actually bound
        val ktorPort   = plugin.teletypeConfig.port

        if (publicPort == gamePort) {
            // Ports conflict — patch server.properties so the next restart unblocks it
            val internalPort = gamePort + 1
            patchServerPort(gamePort, internalPort)
            plugin.logger.warning(
                "[Teletype] multiplex-game-port: conflict — game is already on :$gamePort. " +
                "server-port in server.properties changed to $internalPort. Restart to activate."
            )
            return
        }

        try {
            startListening(publicPort, ktorPort, gamePort)
        } catch (e: Exception) {
            plugin.logger.severe("[Teletype] Multiplexer failed to bind :$publicPort — ${e.message}")
        }
    }

    private fun startListening(publicPort: Int, ktorPort: Int, gamePort: Int) {
        val ss = ServerSocket(publicPort)
        serverSocket = ss
        val pool = Executors.newCachedThreadPool { r ->
            Thread(r, "teletype-mux").also { it.isDaemon = true }
        }
        executor = pool

        pool.submit {
            plugin.logger.info(
                "[Teletype] Port multiplexer on :$publicPort — HTTP → :$ktorPort, Minecraft → :$gamePort"
            )
            while (!ss.isClosed) {
                try {
                    val client = ss.accept()
                    pool.submit { handleConnection(client, ktorPort, gamePort) }
                } catch (e: Exception) {
                    if (!ss.isClosed) plugin.logger.warning("[Teletype] Multiplexer accept error: ${e.message}")
                }
            }
        }
    }

    fun uninstall() {
        serverSocket?.close()
        serverSocket = null
        executor?.shutdownNow()
        executor = null
    }

    private fun handleConnection(client: Socket, ktorPort: Int, gamePort: Int) {
        client.use {
            val header = ByteArray(4)
            val n = readExact(client.getInputStream(), header)
            if (n < 4) return

            val targetPort = if (isHttp(header)) ktorPort else gamePort
            try {
                Socket("127.0.0.1", targetPort).use { backend ->
                    val backendOut = backend.getOutputStream()
                    backendOut.write(header, 0, n)
                    // Relay both directions concurrently; capture executor before lambda
                    val pool = executor ?: return
                    val upstream = pool.submit { relay(client.getInputStream(), backendOut) }
                    relay(backend.getInputStream(), client.getOutputStream())
                    upstream.get()
                }
            } catch (_: Exception) {}
        }
    }

    private fun readExact(input: InputStream, buf: ByteArray): Int {
        var total = 0
        while (total < buf.size) {
            val n = input.read(buf, total, buf.size - total)
            if (n == -1) break
            total += n
        }
        return total
    }

    private fun relay(input: InputStream, output: OutputStream) {
        val buf = ByteArray(8192)
        try {
            var n: Int
            while (input.read(buf).also { n = it } != -1) {
                output.write(buf, 0, n)
                output.flush()
            }
        } catch (_: Exception) {}
    }

    private fun isHttp(bytes: ByteArray): Boolean {
        val s = String(bytes, Charsets.ISO_8859_1)
        return s.startsWith("GET ") || s.startsWith("POST") || s.startsWith("PUT ") ||
               s.startsWith("DELE") || s.startsWith("HEAD") || s.startsWith("OPTI") ||
               s.startsWith("PATC") || s.startsWith("CONN")
    }

    private fun patchServerPort(oldPort: Int, newPort: Int) {
        val file = File(System.getProperty("user.dir"), "server.properties")
        if (!file.exists()) return
        val patched = file.readText().replace("server-port=$oldPort", "server-port=$newPort")
        file.writeText(patched)
    }

    companion object {
        fun readGamePort(): Int {
            val props = Properties()
            val file = File(System.getProperty("user.dir"), "server.properties")
            if (file.exists()) file.inputStream().use { props.load(it) }
            return props.getProperty("server-port", "25565").toIntOrNull() ?: 25565
        }
    }
}
