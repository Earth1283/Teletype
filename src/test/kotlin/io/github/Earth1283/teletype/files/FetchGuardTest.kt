package io.github.Earth1283.teletype.files

import java.net.InetAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FetchGuardTest {
    @Test
    fun `only http and https URLs are accepted`() {
        assertEquals("https", FetchGuard.parse("https://example.com/file.jar").protocol)
        listOf("file:///etc/passwd", "jar:file:/x.jar!/a", "ftp://example.com/a", "not a url", "http:///nohost")
            .forEach { assertFailsWith<FetchGuard.FetchException>(it) { FetchGuard.parse(it) } }
    }

    @Test
    fun `credentials in URLs are rejected`() {
        assertFailsWith<FetchGuard.FetchException> { FetchGuard.parse("https://user:pass@example.com/") }
    }

    @Test
    fun `local, private and metadata addresses are blocked`() {
        listOf(
            "127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254",
            "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1",
        ).forEach { assertTrue(FetchGuard.isBlockedAddress(InetAddress.getByName(it)), it) }
    }

    @Test
    fun `public addresses are allowed`() {
        listOf("1.1.1.1", "8.8.8.8", "2606:4700:4700::1111")
            .forEach { assertFalse(FetchGuard.isBlockedAddress(InetAddress.getByName(it)), it) }
    }
}
