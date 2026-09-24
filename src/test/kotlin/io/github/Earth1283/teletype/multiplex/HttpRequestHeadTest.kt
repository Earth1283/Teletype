package io.github.Earth1283.teletype.multiplex

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HttpRequestHeadTest {
    private fun head(vararg lines: String) = (lines.joinToString("\r\n") + "\r\n\r\n").toByteArray(Charsets.ISO_8859_1)

    @Test
    fun `parses the path without the query string`() {
        val req = assertNotNull(HttpRequestHead.parse(head("GET /map/tiles?z=1 HTTP/1.1", "Host: x")))
        assertEquals("/map/tiles", req.path)
    }

    @Test
    fun `rejects malformed request lines`() {
        assertNull(HttpRequestHead.parse(head("garbage")))
    }

    @Test
    fun `plain requests are forced to close and get the client address`() {
        val req = assertNotNull(HttpRequestHead.parse(head(
            "GET / HTTP/1.1", "Host: x", "Connection: keep-alive", "${PortMultiplexer.CLIENT_ADDRESS_HEADER}: 6.6.6.6",
        )))
        val out = String(req.rewriteForProxy("1.2.3.4"), Charsets.ISO_8859_1)

        assertTrue(out.startsWith("GET / HTTP/1.1\r\n"))
        assertTrue("Connection: close\r\n" in out)
        assertFalse("keep-alive" in out)
        assertTrue("${PortMultiplexer.CLIENT_ADDRESS_HEADER}: 1.2.3.4\r\n" in out)
        assertFalse("6.6.6.6" in out)
        assertTrue(out.endsWith("\r\n\r\n"))
    }

    @Test
    fun `websocket upgrades keep their Connection header`() {
        val req = assertNotNull(HttpRequestHead.parse(head(
            "GET /ws/console HTTP/1.1", "Host: x", "Connection: Upgrade", "Upgrade: websocket",
        )))
        val out = String(req.rewriteForProxy("1.2.3.4"), Charsets.ISO_8859_1)

        assertTrue("Connection: Upgrade\r\n" in out)
        assertFalse("Connection: close" in out)
    }
}

class ProtocolClassificationTest {
    private fun bytes(vararg b: Int) = ByteArray(b.size) { b[it].toByte() }

    @Test
    fun `http methods are recognised`() {
        listOf("GET ", "POST", "PUT ", "DELE", "HEAD", "OPTI", "PATC").forEach {
            assertEquals(PortMultiplexer.Protocol.HTTP, PortMultiplexer.classify(it.toByteArray()), it)
        }
    }

    @Test
    fun `tls client hello is recognised`() {
        assertEquals(PortMultiplexer.Protocol.TLS, PortMultiplexer.classify(bytes(0x16, 0x03, 0x01, 0x02)))
    }

    @Test
    fun `minecraft handshakes fall through to the game server`() {
        assertEquals(PortMultiplexer.Protocol.MINECRAFT, PortMultiplexer.classify(bytes(0x10, 0x00, 0xFF, 0x05)))
        assertEquals(PortMultiplexer.Protocol.MINECRAFT, PortMultiplexer.classify(bytes(0x16, 0x00, 0xFF, 0x05)))
        assertEquals(PortMultiplexer.Protocol.MINECRAFT, PortMultiplexer.classify(bytes(0xFE, 0x01, 0xFA, 0x00)))
    }
}
