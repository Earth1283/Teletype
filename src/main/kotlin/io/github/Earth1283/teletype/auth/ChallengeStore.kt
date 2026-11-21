package io.github.Earth1283.teletype.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID

class ChallengeStore(
    private val ttlSeconds: () -> Long,
    private val clock: Clock = Clock.systemUTC(),
) {
    data class CreatedChallenge(val uuid: UUID, val pollToken: String)

    sealed interface PollResult {
        data object Pending : PollResult
        data class Verified(val jwt: String) : PollResult
    }

    private class PendingChallenge(val pollToken: ByteArray, val remoteAddress: String, val expiresAt: Instant) {
        val result = CompletableDeferred<String?>()
    }

    private val store = mutableMapOf<UUID, PendingChallenge>()

    @Synchronized
    fun createChallenge(remoteAddress: String): CreatedChallenge? {
        val now = clock.instant()
        store.entries.removeIf { (_, challenge) -> !now.isBefore(challenge.expiresAt) }
        if (store.size >= MAX_PENDING_CHALLENGES) return null

        val challenge = CreatedChallenge(UUID.randomUUID(), UUID.randomUUID().toString())
        store[challenge.uuid] = PendingChallenge(
            challenge.pollToken.toByteArray(), remoteAddress, now.plusSeconds(ttlSeconds().coerceAtLeast(1)),
        )
        return challenge
    }

    @Synchronized
    fun verificationAddress(uuid: UUID): String? = getActive(uuid)?.remoteAddress

    @Synchronized
    fun verify(uuid: UUID, jwt: String): Boolean = getActive(uuid)?.result?.complete(jwt) == true

    suspend fun poll(uuid: UUID, pollToken: String): PollResult? {
        val challenge = synchronized(this) {
            getActive(uuid)?.takeIf { MessageDigest.isEqual(it.pollToken, pollToken.toByteArray()) }
        } ?: return null

        val waitMillis = Duration.between(clock.instant(), challenge.expiresAt).toMillis()
            .coerceIn(1, MAX_POLL_WAIT_MS)
        val jwt = withTimeoutOrNull(waitMillis) { challenge.result.await() }

        return synchronized(this) {
            if (getActive(uuid) !== challenge) return@synchronized null
            if (jwt == null) return@synchronized PollResult.Pending
            store.remove(uuid)
            PollResult.Verified(jwt)
        }
    }

    fun clear() {
        val pending = synchronized(this) { store.values.toList().also { store.clear() } }
        pending.forEach { it.result.complete(null) }
    }

    private fun getActive(uuid: UUID): PendingChallenge? {
        val challenge = store[uuid] ?: return null
        if (clock.instant().isBefore(challenge.expiresAt)) return challenge
        store.remove(uuid)
        return null
    }

    private companion object {
        const val MAX_PENDING_CHALLENGES = 1_000
        const val MAX_POLL_WAIT_MS = 30_000L
    }
}
