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
        val cfg = plugin.teletypeConfig
        if (!cfg.retentionEnabled) return

        val now = System.currentTimeMillis()
        val downsample1sAfterMs = cfg.retentionDownsample1sAfterHours.coerceAtLeast(1) * 3_600_000L
        val downsample1mAfterMs = cfg.retentionDownsample1mAfterDays.coerceAtLeast(1) * 86_400_000L
        val delete15mAfterDays = cfg.retentionDelete15mAfterDays
        val d30 = now - 30L * 86_400_000L

        // The job runs once a day, so each window covers exactly the slice of rows that
        // crossed the retention threshold since the previous run (e.g. default 48h means
        // rows 48-72h old get downsampled today, having been 24-48h old yesterday).
        val downsample1sFrom = now - downsample1sAfterMs - 86_400_000L
        val downsample1sTo   = now - downsample1sAfterMs
        val downsample1mFrom = now - downsample1mAfterMs - 86_400_000L
        val downsample1mTo   = now - downsample1mAfterMs

        try {
            plugin.messages.console("metrics.retention-start")
            db.downsampleToMinute(from = downsample1sFrom, to = downsample1sTo)
            db.downsampleTo15Min(from = downsample1mFrom, to = downsample1mTo)
            // 0 = keep 15-minute rows forever (see config.yml)
            if (delete15mAfterDays > 0) {
                db.pruneMetrics15m(before = now - delete15mAfterDays * 86_400_000L)
            }
            db.prunePlayerEvents(before = d30)
            db.pruneGcEvents(before = d30)
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
