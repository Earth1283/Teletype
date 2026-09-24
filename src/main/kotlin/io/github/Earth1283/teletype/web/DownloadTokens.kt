package io.github.Earth1283.teletype.web

import java.io.File
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap

class DownloadTokens(private val ttlMs: Long = 60_000L) {
    data class Ticket(val file: File, val downloadName: String, val expiresAt: Long)

    private val tickets = ConcurrentHashMap<String, Ticket>()
    private val random = SecureRandom()

    fun issue(file: File, downloadName: String = file.name): String {
        purgeExpired()
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(24).also(random::nextBytes))
        tickets[token] = Ticket(file, downloadName, System.currentTimeMillis() + ttlMs)
        return token
    }

    fun redeemOnce(token: String): Ticket? =
        tickets.remove(token)?.takeIf { it.expiresAt >= System.currentTimeMillis() }

    fun clear() = tickets.clear()

    private fun purgeExpired() {
        val now = System.currentTimeMillis()
        tickets.entries.removeIf { it.value.expiresAt < now }
    }
}
