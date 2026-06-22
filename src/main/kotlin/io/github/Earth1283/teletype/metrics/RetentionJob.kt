package io.github.Earth1283.teletype.metrics

import io.github.Earth1283.teletype.Teletype
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

class RetentionJob(
    private val plugin: Teletype,
    private val db: MetricsDatabase,
    private val scope: CoroutineScope
) {
    fun start() {
        scope.launch {
            while (isActive) {
                delay(millisUntilMidnight())
                runRetention()
            }
        }
    }

    private suspend fun runRetention() {
        val now = System.currentTimeMillis()
        val h24 = now - 24L * 3_600_000L
        val h48 = now - 48L * 3_600_000L
        val d7  = now -  7L * 86_400_000L
        val d8  = now -  8L * 86_400_000L

        try {
            plugin.messages.console("metrics.retention-start")
            // Downsample 48h–24h ago: raw 1s → 1 min, delete raw rows
            db.downsampleToMinute(from = h48, to = h24)
            // Downsample 8d–7d ago: 1 min → 15 min, delete minute rows
            db.downsampleTo15Min(from = d8, to = d7)
            plugin.messages.console("metrics.retention-done")
        } catch (e: Exception) {
            plugin.messages.console("metrics.retention-failed", "error" to (e.message ?: "unknown"))
        }
    }

    private fun millisUntilMidnight(): Long {
        val now = ZonedDateTime.now(ZoneId.systemDefault())
        val midnight = now.toLocalDate().plusDays(1).atStartOfDay(ZoneId.systemDefault())
        return ChronoUnit.MILLIS.between(now, midnight).coerceAtLeast(1_000L)
    }
}
