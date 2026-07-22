package io.github.Earth1283.teletype.auth

import io.github.Earth1283.teletype.Teletype
import kotlinx.coroutines.CompletableDeferred
import org.bukkit.scheduler.BukkitRunnable
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class ChallengeStore(private val plugin: Teletype) {
    private val store = ConcurrentHashMap<UUID, PendingChallenge>()

    init {
        object : BukkitRunnable() {
            override fun run() {
                val ttlSeconds = plugin.teletypeConfig.challengeTtlSeconds.coerceAtLeast(1L)
                val cutoff = Instant.now().minusSeconds(ttlSeconds)
                store.entries.removeIf { (_, challenge) ->
                    if (challenge.createdAt.isBefore(cutoff)) {
                        challenge.deferred.cancel()
                        true
                    } else false
                }
            }
        }.runTaskTimerAsynchronously(plugin, 600L, 600L)
    }

    fun createChallenge(remoteAddress: String): PendingChallenge {
        val challenge = PendingChallenge(
            uuid = UUID.randomUUID(),
            createdAt = Instant.now(),
            remoteAddress = remoteAddress,
            deferred = CompletableDeferred()
        )
        store[challenge.uuid] = challenge
        return challenge
    }

    fun getPending(uuid: UUID): PendingChallenge? = store[uuid]

    fun verify(uuid: UUID, jwt: String): Boolean {
        val challenge = store[uuid] ?: return false
        return challenge.deferred.complete(jwt)
    }

    fun remove(uuid: UUID) {
        store.remove(uuid)
    }
}
