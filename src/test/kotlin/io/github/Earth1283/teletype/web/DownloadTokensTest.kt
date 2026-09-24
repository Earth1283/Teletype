package io.github.Earth1283.teletype.web

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

class DownloadTokensTest {
    @Test
    fun `tokens redeem once`() {
        val tokens = DownloadTokens()
        val token = tokens.issue(File("a.txt"), "renamed.txt")

        assertEquals("renamed.txt", tokens.redeemOnce(token)?.downloadName)
        assertNull(tokens.redeemOnce(token))
    }

    @Test
    fun `expired tokens are rejected`() {
        val tokens = DownloadTokens(ttlMs = -1)
        assertNull(tokens.redeemOnce(tokens.issue(File("a.txt"))))
    }

    @Test
    fun `tokens are unique`() {
        val tokens = DownloadTokens()
        assertNotEquals(tokens.issue(File("a")), tokens.issue(File("a")))
    }
}
