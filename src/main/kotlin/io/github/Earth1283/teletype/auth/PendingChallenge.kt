package io.github.Earth1283.teletype.auth

import kotlinx.coroutines.CompletableDeferred
import java.time.Instant
import java.util.UUID

data class PendingChallenge(
    val uuid: UUID,
    val createdAt: Instant,
    val remoteAddress: String,
    val deferred: CompletableDeferred<String>
)
