package io.github.Earth1283.teletype.multiplex

import io.github.Earth1283.teletype.Teletype
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.ServerSocket
import java.net.Socket
import java.util.Properties
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore

class PortMultiplexer(private val plugin: Teletype) {

    private var serverSocket: ServerSocket? = null
    private var executor: ExecutorService? = null
    private val rateLimiter = ProxyRateLimiter()

    fun install() {
        val publicPort = plugin.teletypeConfig.multiplexPort
        val gamePort = plugin.server.port

        if (publicPort == gamePort) {
            val internalPort = gamePort + 1
            patchServerPort(gamePort, internalPort)
            plugin.logger.warning(
                "[Teletype] multiplex-game-port: conflict — game is already on :$gamePort. " +
                "server-port in server.properties changed to $internalPort. Restart to activate."
            )
            return
        }

        try {
            startListening(publicPort, gamePort)
        } catch (e: Exception) {
            plugin.logger.severe("[Teletype] Multiplexer failed to bind :$publicPort — ${e.message}")
        }
    }

    private fun startListening(publicPort: Int, gamePort: Int) {
        val cfg = plugin.teletypeConfig
        val targets = Targets(
            ktorPort = cfg.port,
            httpsPort = cfg.tlsHttpsPort.takeIf { cfg.tlsEnabled },
            gamePort = gamePort,
            forwardPlayerAddresses = cfg.forwardMinecraftPlayerAddresses,
        )
        val slots = Semaphore(cfg.multiplexMaxConnections)
        val ss = ServerSocket(publicPort)
        serverSocket = ss
        val pool = Executors.newCachedThreadPool { r -> Thread(r, "teletype-mux").also { it.isDaemon = true } }
        executor = pool

        pool.submit {
            plugin.logger.info(
                "[Teletype] Port multiplexer on :$publicPort — HTTP → :${targets.ktorPort}, " +
                    "Minecraft → :$gamePort, player IP forwarding=${if (targets.forwardPlayerAddresses) "on" else "off"}"
            )
            while (!ss.isClosed) {
                try {
                    val client = ss.accept()
                    if (!slots.tryAcquire()) {
                        runCatching { client.close() }
                        continue
                    }
                    pool.submit {
                        try { handleConnection(client, targets) } finally { slots.release() }
                    }
                } catch (e: Exception) {
                    if (!ss.isClosed) plugin.logger.warning("[Teletype] Multiplexer accept error: ${e.message}")
                }
            }
        }
    }

    fun uninstall() {
        rateLimiter.shutdown()
        serverSocket?.close()
        serverSocket = null
        executor?.shutdownNow()
        executor = null
    }

    private data class Targets(val ktorPort: Int, val httpsPort: Int?, val gamePort: Int, val forwardPlayerAddresses: Boolean)

    private fun handleConnection(client: Socket, targets: Targets) {
        client.use {
            client.tcpNoDelay = true
            client.soTimeout = SNIFF_TIMEOUT_MS
            val input = client.getInputStream()
            val header = ByteArray(4)
            if (runCatching { readExact(input, header) }.getOrDefault(0) < 4) return

            val protocol = classify(header)
            val httpsPort = targets.httpsPort
            when {
                protocol == Protocol.HTTP -> Unit
                protocol == Protocol.TLS && httpsPort != null -> {
                    client.soTimeout = 0
                    relay(client, httpsPort, header)
                    return
                }
                else -> {
                    client.soTimeout = 0
                    val proxyHeader = if (targets.forwardPlayerAddresses) proxyProtocolHeader(client) else ByteArray(0)
                    relay(client, targets.gamePort, proxyHeader + header)
                    return
                }
            }

            val head = runCatching { readRequestHead(input, header) }.getOrNull() ?: return
            client.soTimeout = 0
            val request = HttpRequestHead.parse(head) ?: return
            val route = if (plugin.teletypeConfig.networkEnabled) plugin.routeStore.findMatch(request.path) else null
            val clientIp = client.inetAddress.hostAddress

            if (route != null && !rateLimiter.allow(route.id, clientIp, route.rateLimitPerMinute)) {
                runCatching { client.getOutputStream().write(TOO_MANY_REQUESTS) }
                return
            }

            val forwarded = request.rewriteForProxy(clientIp)
            relay(client, route?.targetPort ?: targets.ktorPort, forwarded)
        }
    }

    private fun relay(client: Socket, targetPort: Int, preface: ByteArray) {
        try {
            Socket("127.0.0.1", targetPort).use { backend ->
                backend.tcpNoDelay = true
                val backendOut = backend.getOutputStream()
                backendOut.write(preface)
                backendOut.flush()
                val pool = executor ?: return
                val upstream = pool.submit { pipe(client.getInputStream(), backendOut) { closeBoth(client, backend) } }
                pipe(backend.getInputStream(), client.getOutputStream()) { closeBoth(client, backend) }
                upstream.get()
            }
        } catch (_: Exception) {}
    }

    private fun closeBoth(a: Socket, b: Socket) {
        runCatching { a.close() }
        runCatching { b.close() }
    }

    private fun proxyProtocolHeader(client: Socket): ByteArray {
        val source = client.inetAddress
        val destination = client.localAddress
        val family = when {
            source is Inet4Address && destination is Inet4Address -> "TCP4"
            source is Inet6Address && destination is Inet6Address -> "TCP6"
            else -> null
        }
        val line = if (family == null) "PROXY UNKNOWN\r\n" else
            "PROXY $family ${cleanAddress(source.hostAddress)} ${cleanAddress(destination.hostAddress)} " +
                "${client.port} ${client.localPort}\r\n"
        return line.toByteArray(Charsets.US_ASCII)
    }

    private fun cleanAddress(value: String): String = value.substringBefore('%')

    private fun readRequestHead(input: InputStream, alreadyRead: ByteArray): ByteArray? {
        val buf = ByteArrayOutputStream().apply { write(alreadyRead) }
        var matched = 0
        while (buf.size() < MAX_REQUEST_HEAD_BYTES) {
            val b = input.read()
            if (b == -1) return null
            buf.write(b)
            matched = when {
                b == HEAD_TERMINATOR[matched].code -> matched + 1
                b == HEAD_TERMINATOR[0].code -> 1
                else -> 0
            }
            if (matched == HEAD_TERMINATOR.length) return buf.toByteArray()
        }
        return null
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

    private fun pipe(input: InputStream, output: java.io.OutputStream, onDone: () -> Unit) {
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

    private fun patchServerPort(oldPort: Int, newPort: Int) {
        val file = File(System.getProperty("user.dir"), "server.properties")
        if (!file.exists()) return
        val patched = file.readText().replace(Regex("(?m)^server-port=$oldPort\\s*$"), "server-port=$newPort")
        file.writeText(patched)
    }

    enum class Protocol { HTTP, TLS, MINECRAFT }

    companion object {
        const val CLIENT_ADDRESS_HEADER = "X-Teletype-Mux-Client"
        private const val SNIFF_TIMEOUT_MS = 10_000
        private const val MAX_REQUEST_HEAD_BYTES = 16 * 1024
        private const val HEAD_TERMINATOR = "\r\n\r\n"
        private val HTTP_METHOD_PREFIXES = setOf("GET ", "POST", "PUT ", "DELE", "HEAD", "OPTI", "PATC", "CONN")
        private val TOO_MANY_REQUESTS =
            "HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray(Charsets.ISO_8859_1)

        private const val TLS_HANDSHAKE_RECORD: Byte = 0x16
        private const val TLS_MAJOR_VERSION: Byte = 0x03

        fun classify(firstBytes: ByteArray): Protocol = when {
            String(firstBytes, Charsets.ISO_8859_1) in HTTP_METHOD_PREFIXES -> Protocol.HTTP
            firstBytes.size >= 2 && firstBytes[0] == TLS_HANDSHAKE_RECORD && firstBytes[1] == TLS_MAJOR_VERSION -> Protocol.TLS
            else -> Protocol.MINECRAFT
        }

        fun readGamePort(): Int {
            val props = Properties()
            val file = File(System.getProperty("user.dir"), "server.properties")
            if (file.exists()) file.inputStream().use { props.load(it) }
            return props.getProperty("server-port", "25565").toIntOrNull() ?: 25565
        }
    }
}

internal class HttpRequestHead(val requestLine: String, val headers: List<Pair<String, String>>) {
    val path: String = requestLine.split(' ').getOrNull(1)?.substringBefore('?')?.ifEmpty { "/" } ?: "/"

    private val isUpgrade: Boolean =
        headers.any { (name, value) -> name.equals("Connection", true) && value.contains("upgrade", ignoreCase = true) }

    fun rewriteForProxy(clientIp: String): ByteArray {
        val kept = headers.filterNot { (name, _) ->
            name.equals(PortMultiplexer.CLIENT_ADDRESS_HEADER, true) || (!isUpgrade && name.equals("Connection", true))
        }
        val added = buildList {
            add(PortMultiplexer.CLIENT_ADDRESS_HEADER to clientIp)
            if (!isUpgrade) add("Connection" to "close")
        }
        return buildString {
            append(requestLine).append("\r\n")
            (kept + added).forEach { (name, value) -> append(name).append(": ").append(value).append("\r\n") }
            append("\r\n")
        }.toByteArray(Charsets.ISO_8859_1)
    }

    companion object {
        fun parse(head: ByteArray): HttpRequestHead? {
            val lines = String(head, Charsets.ISO_8859_1).split("\r\n").filter { it.isNotEmpty() }
            val requestLine = lines.firstOrNull()?.takeIf { it.split(' ').size >= 3 } ?: return null
            val headers = lines.drop(1).mapNotNull { line ->
                val colon = line.indexOf(':')
                if (colon <= 0) null else line.substring(0, colon).trim() to line.substring(colon + 1).trim()
            }
            return HttpRequestHead(requestLine, headers)
        }
    }
}
