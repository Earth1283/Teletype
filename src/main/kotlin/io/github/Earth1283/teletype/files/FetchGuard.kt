package io.github.Earth1283.teletype.files

import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.URL

object FetchGuard {
    private const val MAX_REDIRECTS = 5
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 30_000

    class FetchException(message: String) : IOException(message)

    fun parse(raw: String): URL {
        val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: throw FetchException("Invalid URL")
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") throw FetchException("Only http and https URLs are allowed")
        if (uri.host.isNullOrBlank()) throw FetchException("URL has no host")
        if (uri.userInfo != null) throw FetchException("URLs with credentials are not allowed")
        return uri.toURL()
    }

    fun isBlockedAddress(addr: InetAddress): Boolean {
        if (addr.isAnyLocalAddress || addr.isLoopbackAddress || addr.isLinkLocalAddress ||
            addr.isSiteLocalAddress || addr.isMulticastAddress) return true
        val b = addr.address.map { it.toInt() and 0xff }
        return when (addr) {
            is Inet4Address -> isReservedIpv4(b)
            is Inet6Address -> isUniqueLocalIpv6(b) || ipv4MappedAddress(addr)?.let(::isBlockedAddress) == true
            else -> true
        }
    }

    private fun isReservedIpv4(b: List<Int>): Boolean =
        b[0] == 0 ||
            (b[0] == 100 && b[1] in 64..127) ||
            (b[0] == 192 && b[1] == 0 && b[2] == 0) ||
            (b[0] == 198 && b[1] in 18..19) ||
            b[0] >= 240

    private fun isUniqueLocalIpv6(b: List<Int>): Boolean = (b[0] and 0xfe) == 0xfc

    private fun ipv4MappedAddress(addr: Inet6Address): InetAddress? {
        val b = addr.address
        val mapped = (0 until 10).all { b[it] == 0.toByte() } && b[10] == 0xff.toByte() && b[11] == 0xff.toByte()
        return if (mapped) InetAddress.getByAddress(b.copyOfRange(12, 16)) else null
    }

    private fun requirePublicHost(url: URL) {
        val addresses = runCatching { InetAddress.getAllByName(url.host) }.getOrNull()
            ?: throw FetchException("Could not resolve ${url.host}")
        if (addresses.any(::isBlockedAddress))
            throw FetchException("Refusing to fetch from a local or private network address (${url.host})")
    }

    fun download(start: URL, out: OutputStream, maxBytes: Long): Long {
        var url = start
        repeat(MAX_REDIRECTS + 1) {
            requirePublicHost(url)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("User-Agent", "Teletype-FileManager")
            }
            try {
                val code = conn.responseCode
                if (code in 300..399) {
                    val location = conn.getHeaderField("Location") ?: throw FetchException("Redirect without Location")
                    url = parse(URL(url, location).toString())
                    return@repeat
                }
                if (code !in 200..299) throw FetchException("Remote server responded with HTTP $code")
                if (conn.contentLengthLong > maxBytes) throw FetchException(tooLarge(maxBytes))
                return conn.inputStream.use { copyLimited(it, out, maxBytes) }
            } finally {
                conn.disconnect()
            }
        }
        throw FetchException("Too many redirects")
    }

    private fun copyLimited(input: InputStream, out: OutputStream, maxBytes: Long): Long {
        val buf = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
            val n = input.read(buf)
            if (n == -1) return total
            total += n
            if (total > maxBytes) throw FetchException(tooLarge(maxBytes))
            out.write(buf, 0, n)
        }
    }

    private fun tooLarge(maxBytes: Long) = "Remote file exceeds the ${maxBytes / (1024 * 1024)} MB fetch limit"
}
