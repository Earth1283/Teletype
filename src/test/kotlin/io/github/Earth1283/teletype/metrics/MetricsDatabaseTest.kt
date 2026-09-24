package io.github.Earth1283.teletype.metrics

import io.github.Earth1283.teletype.web.model.MetricSnapshot
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MetricsDatabaseTest {
    @TempDir
    lateinit var tempDir: Path
    private lateinit var db: MetricsDatabase

    private fun snapshot(ts: Long, tps: Double = 20.0) =
        MetricSnapshot(ts, tps, tps, tps, 5.0, 100, 200, 400, 0)

    @AfterTest
    fun close() = db.close()

    @Test
    fun `long windows include raw rows older than 24 hours that have not been downsampled yet`() = runBlocking {
        db = MetricsDatabase(tempDir.toFile())
        val now = System.currentTimeMillis()
        val thirtyHoursAgo = now - 30 * 3_600_000L
        db.insert(listOf(snapshot(thirtyHoursAgo), snapshot(now - 60_000)))

        val week = db.history(7 * 24 * 60)
        assertEquals(2, week.size)
        assertTrue(week.first().timestamp <= thirtyHoursAgo)
    }

    @Test
    fun `downsampling moves every older row, including missed days`() = runBlocking {
        db = MetricsDatabase(tempDir.toFile())
        val now = System.currentTimeMillis()
        val old = listOf(5L, 6L).map { days -> (now - days * 86_400_000L) / 60_000L * 60_000L }
        db.insert(old.flatMap { base -> listOf(snapshot(base, 10.0), snapshot(base + 1_000, 20.0)) })

        db.downsampleToMinute(before = now - 48 * 3_600_000L)

        val rows = db.history(8 * 24 * 60)
        assertEquals(2, rows.size)
        rows.forEach { assertEquals(15.0, it.tps1, 0.001) }
    }
}
