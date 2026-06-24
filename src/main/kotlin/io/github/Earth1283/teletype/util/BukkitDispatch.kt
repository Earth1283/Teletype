package io.github.Earth1283.teletype.util

import io.github.Earth1283.teletype.Teletype
import kotlinx.coroutines.suspendCancellableCoroutine
import org.bukkit.Bukkit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

suspend fun <T> Teletype.onServerThread(block: () -> T): T {
    if (Bukkit.isPrimaryThread()) return block()

    return suspendCancellableCoroutine { continuation ->
        val task = Bukkit.getScheduler().runTask(this, Runnable {
            try {
                continuation.resume(block())
            } catch (e: Throwable) {
                continuation.resumeWithException(e)
            }
        })
        continuation.invokeOnCancellation { task.cancel() }
    }
}
