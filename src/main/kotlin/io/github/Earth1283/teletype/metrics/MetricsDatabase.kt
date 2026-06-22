package io.github.Earth1283.teletype.metrics

import io.github.Earth1283.teletype.web.model.MetricSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.sqlite.SQLiteDataSource
import java.io.File
import java.sql.Connection

class MetricsDatabase(dataFolder: File) {

    private val mutex = Mutex()
    private val conn: Connection

    init {
        dataFolder.mkdirs()
        val ds = SQLiteDataSource()
        ds.url = "jdbc:sqlite:${File(dataFolder, "teletype-metrics.db").absolutePath}"
        conn = ds.connection
        conn.createStatement().use { stmt ->
            stmt.executeUpdate("PRAGMA journal_mode=WAL")
            stmt.executeUpdate("PRAGMA synchronous=NORMAL")
            stmt.executeUpdate("PRAGMA cache_size=-8000")
            for (table in listOf("metrics_1s", "metrics_1m", "metrics_15m")) {
                stmt.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS $table (
                      ts         INTEGER PRIMARY KEY,
                      tps1       REAL, tps5 REAL, tps15 REAL,
                      tick_ms    REAL,
                      mem_used   INTEGER, mem_total INTEGER, mem_max INTEGER,
                      uptime_ms  INTEGER
                    )
                """.trimIndent())
                stmt.executeUpdate("CREATE INDEX IF NOT EXISTS idx_${table}_ts ON $table(ts)")
            }
        }
    }

    suspend fun insert(samples: List<MetricSnapshot>) {
        if (samples.isEmpty()) return
        mutex.withLock {
            withContext(Dispatchers.IO) {
                val sql = "INSERT OR IGNORE INTO metrics_1s (ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms) VALUES (?,?,?,?,?,?,?,?,?)"
                conn.autoCommit = false
                try {
                    conn.prepareStatement(sql).use { ps ->
                        for (s in samples) {
                            ps.setLong(1, s.timestamp)
                            ps.setDouble(2, s.tps1)
                            ps.setDouble(3, s.tps5)
                            ps.setDouble(4, s.tps15)
                            ps.setDouble(5, s.tickTimeMs)
                            ps.setLong(6, s.memUsedMb)
                            ps.setLong(7, s.memTotalMb)
                            ps.setLong(8, s.memMaxMb)
                            ps.setLong(9, s.uptimeMs)
                            ps.addBatch()
                        }
                        ps.executeBatch()
                    }
                    conn.commit()
                } catch (e: Exception) {
                    conn.rollback()
                    throw e
                } finally {
                    conn.autoCommit = true
                }
            }
        }
    }

    /**
     * Returns history for the given window in minutes, automatically selecting
     * the appropriate resolution table:
     *   ≤ 60 min  → metrics_1s (1-second rows)
     *   ≤ 7 days  → metrics_1m (1-minute rows)
     *   > 7 days  → metrics_15m (15-minute rows)
     */
    suspend fun history(windowMinutes: Int): List<MetricSnapshot> = mutex.withLock {
        withContext(Dispatchers.IO) {
            val now  = System.currentTimeMillis()
            val from = now - windowMinutes * 60_000L
            val table = when {
                windowMinutes <= 60     -> "metrics_1s"
                windowMinutes <= 10_080 -> "metrics_1m"
                else                    -> "metrics_15m"
            }
            queryTable(table, from, now)
        }
    }

    /**
     * Averages 60 one-second rows into one-minute rows for [from, to),
     * then deletes the raw rows.
     */
    suspend fun downsampleToMinute(from: Long, to: Long) = mutex.withLock {
        withContext(Dispatchers.IO) {
            conn.autoCommit = false
            try {
                conn.prepareStatement("""
                    INSERT OR IGNORE INTO metrics_1m (ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms)
                    SELECT (ts / 60000) * 60000,
                           AVG(tps1), AVG(tps5), AVG(tps15), AVG(tick_ms),
                           CAST(AVG(mem_used)   AS INTEGER),
                           CAST(AVG(mem_total)  AS INTEGER),
                           CAST(AVG(mem_max)    AS INTEGER),
                           CAST(AVG(uptime_ms)  AS INTEGER)
                    FROM metrics_1s
                    WHERE ts >= ? AND ts < ?
                    GROUP BY (ts / 60000)
                """.trimIndent()).use { ps ->
                    ps.setLong(1, from); ps.setLong(2, to)
                    ps.executeUpdate()
                }
                conn.prepareStatement("DELETE FROM metrics_1s WHERE ts >= ? AND ts < ?").use { ps ->
                    ps.setLong(1, from); ps.setLong(2, to)
                    ps.executeUpdate()
                }
                conn.commit()
            } catch (e: Exception) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = true
            }
        }
    }

    /**
     * Averages 15 one-minute rows into one 15-minute row for [from, to),
     * then deletes the minute rows.
     */
    suspend fun downsampleTo15Min(from: Long, to: Long) = mutex.withLock {
        withContext(Dispatchers.IO) {
            conn.autoCommit = false
            try {
                conn.prepareStatement("""
                    INSERT OR IGNORE INTO metrics_15m (ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms)
                    SELECT (ts / 900000) * 900000,
                           AVG(tps1), AVG(tps5), AVG(tps15), AVG(tick_ms),
                           CAST(AVG(mem_used)   AS INTEGER),
                           CAST(AVG(mem_total)  AS INTEGER),
                           CAST(AVG(mem_max)    AS INTEGER),
                           CAST(AVG(uptime_ms)  AS INTEGER)
                    FROM metrics_1m
                    WHERE ts >= ? AND ts < ?
                    GROUP BY (ts / 900000)
                """.trimIndent()).use { ps ->
                    ps.setLong(1, from); ps.setLong(2, to)
                    ps.executeUpdate()
                }
                conn.prepareStatement("DELETE FROM metrics_1m WHERE ts >= ? AND ts < ?").use { ps ->
                    ps.setLong(1, from); ps.setLong(2, to)
                    ps.executeUpdate()
                }
                conn.commit()
            } catch (e: Exception) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = true
            }
        }
    }

    private fun queryTable(table: String, from: Long, to: Long): List<MetricSnapshot> {
        val result = mutableListOf<MetricSnapshot>()
        conn.prepareStatement(
            "SELECT ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms FROM $table WHERE ts >= ? AND ts <= ? ORDER BY ts"
        ).use { ps ->
            ps.setLong(1, from); ps.setLong(2, to)
            ps.executeQuery().use { rs ->
                while (rs.next()) {
                    result += MetricSnapshot(
                        timestamp  = rs.getLong("ts"),
                        tps1       = rs.getDouble("tps1"),
                        tps5       = rs.getDouble("tps5"),
                        tps15      = rs.getDouble("tps15"),
                        tickTimeMs = rs.getDouble("tick_ms"),
                        memUsedMb  = rs.getLong("mem_used"),
                        memTotalMb = rs.getLong("mem_total"),
                        memMaxMb   = rs.getLong("mem_max"),
                        uptimeMs   = rs.getLong("uptime_ms")
                    )
                }
            }
        }
        return result
    }

    fun close() {
        try { conn.close() } catch (_: Exception) {}
    }
}
