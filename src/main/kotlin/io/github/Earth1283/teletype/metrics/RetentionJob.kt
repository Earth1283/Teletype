package io.github.Earth1283.teletype.metrics

import io.github.Earth1283.teletype.Teletype
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

private const val HOUR_MS = 3_600_000L
private const val DAY_MS = 86_400_000L
private const val EVENT_RETENTION_DAYS = 30L
private const val STARTUP_DELAY_MS = 5 * 60_000L

data class RetentionCutoffs(
    val downsampleRawBefore: Long,
    val downsampleMinutesBefore: Long,
    val delete15mBefore: Long?,
    val deleteEventsBefore: Long,
) {
    companion object {
        fun at(now: Long, rawAfterHours: Int, minuteAfterDays: Int, delete15mAfterDays: Int) = RetentionCutoffs(
            downsampleRawBefore = now - rawAfterHours.coerceAtLeast(1) * HOUR_MS,
            downsampleMinutesBefore = now - minuteAfterDays.coerceAtLeast(1) * DAY_MS,
            delete15mBefore = if (delete15mAfterDays > 0) now - delete15mAfterDays * DAY_MS else null,
            deleteEventsBefore = now - EVENT_RETENTION_DAYS * DAY_MS,
        )
    }
}

class RetentionJob(
    private val plugin: Teletype,
    private val db: MetricsDatabase,
    private val scope: CoroutineScope
) {
    fun start() {
        scope.launch {
            delay(STARTUP_DELAY_MS)
            runRetention()
            while (isActive) {
                delay(millisUntilMidnight())
                runRetention()
            }
        }
    }

    private suspend fun runRetention() {
        val cfg = plugin.teletypeConfig
        if (!cfg.retentionEnabled) return

        val cutoffs = RetentionCutoffs.at(
            now = System.currentTimeMillis(),
            rawAfterHours = cfg.retentionDownsample1sAfterHours,
            minuteAfterDays = cfg.retentionDownsample1mAfterDays,
            delete15mAfterDays = cfg.retentionDelete15mAfterDays,
        )

        try {
            plugin.messages.console("metrics.retention-start")
            db.downsampleToMinute(before = cutoffs.downsampleRawBefore)
            db.downsampleTo15Min(before = cutoffs.downsampleMinutesBefore)
            cutoffs.delete15mBefore?.let { db.pruneMetrics15m(before = it) }
            db.prunePlayerEvents(before = cutoffs.deleteEventsBefore)
            db.pruneGcEvents(before = cutoffs.deleteEventsBefore)
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
