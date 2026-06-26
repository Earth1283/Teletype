package io.github.Earth1283.teletype.metrics

import io.github.Earth1283.teletype.web.model.MetricSnapshot
import io.github.Earth1283.teletype.web.model.PlayerEvent
import io.github.Earth1283.teletype.web.model.GcEvent
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
            stmt.executeUpdate("""
                CREATE TABLE IF NOT EXISTS player_events (
                  ts     INTEGER NOT NULL,
                  uuid   TEXT    NOT NULL,
                  name   TEXT    NOT NULL,
                  action TEXT    NOT NULL
                )
            """.trimIndent())
            stmt.executeUpdate("CREATE INDEX IF NOT EXISTS idx_player_events_ts ON player_events(ts)")
            stmt.executeUpdate("""
                CREATE TABLE IF NOT EXISTS gc_events (
                  ts          INTEGER NOT NULL,
                  name        TEXT    NOT NULL,
                  action      TEXT    NOT NULL,
                  cause       TEXT    NOT NULL,
                  duration_ms INTEGER NOT NULL
                )
            """.trimIndent())
            stmt.executeUpdate("CREATE INDEX IF NOT EXISTS idx_gc_events_ts ON gc_events(ts)")
        }
        // Idempotent column migrations — add new columns to existing tables without data loss.
        val newCols = linkedMapOf(
            "cpu_pct"        to "REAL",
            "sys_mem_used"   to "INTEGER",
            "sys_mem_total"  to "INTEGER",
            "disk_used_gb"   to "INTEGER",
            "disk_total_gb"  to "INTEGER",
            "player_count"   to "INTEGER",
            "entity_count"   to "INTEGER",
            "loaded_chunks"  to "INTEGER",
            "ping_p50"       to "INTEGER",
            "ping_p95"       to "INTEGER",
        )
        for (table in listOf("metrics_1s", "metrics_1m", "metrics_15m")) {
            val existing = conn.prepareStatement("PRAGMA table_info($table)").use { ps ->
                val cols = mutableSetOf<String>()
                ps.executeQuery().use { rs -> while (rs.next()) cols += rs.getString("name") }
                cols
            }
            conn.createStatement().use { s ->
                for ((col, type) in newCols) {
                    if (col !in existing) s.executeUpdate("ALTER TABLE $table ADD COLUMN $col $type")
                }
            }
        }
    }

    suspend fun insert(samples: List<MetricSnapshot>) {
        if (samples.isEmpty()) return
        mutex.withLock {
            withContext(Dispatchers.IO) {
                val sql = """
                    INSERT OR IGNORE INTO metrics_1s
                    (ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms,
                     cpu_pct, sys_mem_used, sys_mem_total, disk_used_gb, disk_total_gb,
                     player_count, entity_count, loaded_chunks, ping_p50, ping_p95)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """.trimIndent()
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
                            ps.setObject(10, s.cpuPercent)
                            ps.setObject(11, s.sysMemUsedMb)
                            ps.setObject(12, s.sysMemTotalMb)
                            ps.setObject(13, s.diskUsedGb)
                            ps.setObject(14, s.diskTotalGb)
                            ps.setInt(15, s.playerCount)
                            ps.setInt(16, s.entityCount)
                            ps.setInt(17, s.loadedChunks)
                            ps.setObject(18, s.pingP50)
                            ps.setObject(19, s.pingP95)
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

    suspend fun insertGcEvents(events: List<GcEvent>) {
        if (events.isEmpty()) return
        mutex.withLock {
            withContext(Dispatchers.IO) {
                conn.prepareStatement(
                    "INSERT INTO gc_events (ts, name, action, cause, duration_ms) VALUES (?,?,?,?,?)"
                ).use { ps ->
                    for (event in events) {
                        ps.setLong(1, event.ts)
                        ps.setString(2, event.name)
                        ps.setString(3, event.action)
                        ps.setString(4, event.cause)
                        ps.setLong(5, event.durationMs)
                        ps.addBatch()
                    }
                    ps.executeBatch()
                }
            }
        }
    }

    /**
     * Returns history for the given window in minutes, automatically selecting
     * the appropriate source rows:
     *   ≤ 60 min  → recent 1-second rows
     *   ≤ 24h     → recent 1-second rows, bucketed for transport
     *   ≤ 7 days  → older 1-minute rows + recent 1-second rows, bucketed
     *   > 7 days  → 15-minute rows + 1-minute rows + recent 1-second rows, bucketed
     *
     * Retention only creates 1-minute rows once raw samples are older than 24h,
     * so recent multi-hour windows must not read metrics_1m exclusively.
     */
    suspend fun history(windowMinutes: Int): List<MetricSnapshot> = mutex.withLock {
        withContext(Dispatchers.IO) {
            val now  = System.currentTimeMillis()
            val from = now - windowMinutes * 60_000L
            if (windowMinutes <= 60) {
                return@withContext queryTable("metrics_1s", from, now)
            }

            val rawCutoff = now - 24L * 3_600_000L
            val minuteCutoff = now - 7L * 86_400_000L
            val bucketMs = bucketSizeMs(windowMinutes)
            val sources = buildList {
                add(MetricSource("metrics_1s", maxOf(from, rawCutoff), now))
                add(MetricSource("metrics_1m", maxOf(from, minuteCutoff), minOf(now, rawCutoff)))
                add(MetricSource("metrics_15m", from, minOf(now, minuteCutoff)))
            }.filter { it.from < it.to }

            queryBucketed(sources, origin = from, bucketMs = bucketMs)
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
                    INSERT OR IGNORE INTO metrics_1m
                    (ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms,
                     cpu_pct, sys_mem_used, sys_mem_total, disk_used_gb, disk_total_gb,
                     player_count, entity_count, loaded_chunks, ping_p50, ping_p95)
                    SELECT (ts / 60000) * 60000,
                           AVG(tps1), AVG(tps5), AVG(tps15), AVG(tick_ms),
                           CAST(AVG(mem_used)   AS INTEGER),
                           CAST(AVG(mem_total)  AS INTEGER),
                           CAST(AVG(mem_max)    AS INTEGER),
                           CAST(AVG(uptime_ms)  AS INTEGER),
                           AVG(cpu_pct),
                           CAST(AVG(sys_mem_used)   AS INTEGER),
                           CAST(AVG(sys_mem_total)  AS INTEGER),
                           CAST(AVG(disk_used_gb)   AS INTEGER),
                           CAST(AVG(disk_total_gb)  AS INTEGER),
                           CAST(AVG(player_count)   AS INTEGER),
                           CAST(AVG(entity_count)   AS INTEGER),
                           CAST(AVG(loaded_chunks)  AS INTEGER),
                           CAST(AVG(ping_p50)       AS INTEGER),
                           CAST(AVG(ping_p95)       AS INTEGER)
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
                    INSERT OR IGNORE INTO metrics_15m
                    (ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms,
                     cpu_pct, sys_mem_used, sys_mem_total, disk_used_gb, disk_total_gb,
                     player_count, entity_count, loaded_chunks, ping_p50, ping_p95)
                    SELECT (ts / 900000) * 900000,
                           AVG(tps1), AVG(tps5), AVG(tps15), AVG(tick_ms),
                           CAST(AVG(mem_used)   AS INTEGER),
                           CAST(AVG(mem_total)  AS INTEGER),
                           CAST(AVG(mem_max)    AS INTEGER),
                           CAST(AVG(uptime_ms)  AS INTEGER),
                           AVG(cpu_pct),
                           CAST(AVG(sys_mem_used)   AS INTEGER),
                           CAST(AVG(sys_mem_total)  AS INTEGER),
                           CAST(AVG(disk_used_gb)   AS INTEGER),
                           CAST(AVG(disk_total_gb)  AS INTEGER),
                           CAST(AVG(player_count)   AS INTEGER),
                           CAST(AVG(entity_count)   AS INTEGER),
                           CAST(AVG(loaded_chunks)  AS INTEGER),
                           CAST(AVG(ping_p50)       AS INTEGER),
                           CAST(AVG(ping_p95)       AS INTEGER)
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

    suspend fun insertPlayerEvent(ts: Long, uuid: String, name: String, action: String) = mutex.withLock {
        withContext(Dispatchers.IO) {
            conn.prepareStatement(
                "INSERT INTO player_events (ts, uuid, name, action) VALUES (?,?,?,?)"
            ).use { ps ->
                ps.setLong(1, ts); ps.setString(2, uuid)
                ps.setString(3, name); ps.setString(4, action)
                ps.executeUpdate()
            }
        }
    }

    suspend fun playerEvents(from: Long, to: Long): List<PlayerEvent> = mutex.withLock {
        withContext(Dispatchers.IO) {
            val result = mutableListOf<PlayerEvent>()
            conn.prepareStatement(
                "SELECT ts, uuid, name, action FROM player_events WHERE ts >= ? AND ts <= ? ORDER BY ts"
            ).use { ps ->
                ps.setLong(1, from); ps.setLong(2, to)
                ps.executeQuery().use { rs ->
                    while (rs.next()) result += PlayerEvent(
                        ts     = rs.getLong("ts"),
                        uuid   = rs.getString("uuid"),
                        name   = rs.getString("name"),
                        action = rs.getString("action"),
                    )
                }
            }
            result
        }
    }

    suspend fun gcEvents(from: Long, to: Long): List<GcEvent> = mutex.withLock {
        withContext(Dispatchers.IO) {
            val result = mutableListOf<GcEvent>()
            conn.prepareStatement(
                "SELECT ts, name, action, cause, duration_ms FROM gc_events WHERE ts >= ? AND ts <= ? ORDER BY ts"
            ).use { ps ->
                ps.setLong(1, from); ps.setLong(2, to)
                ps.executeQuery().use { rs ->
                    while (rs.next()) result += GcEvent(
                        ts         = rs.getLong("ts"),
                        name       = rs.getString("name"),
                        action     = rs.getString("action"),
                        cause      = rs.getString("cause"),
                        durationMs = rs.getLong("duration_ms"),
                    )
                }
            }
            result
        }
    }

    suspend fun prunePlayerEvents(before: Long) = mutex.withLock {
        withContext(Dispatchers.IO) {
            conn.prepareStatement("DELETE FROM player_events WHERE ts < ?").use { ps ->
                ps.setLong(1, before); ps.executeUpdate()
            }
        }
    }

    suspend fun pruneGcEvents(before: Long) = mutex.withLock {
        withContext(Dispatchers.IO) {
            conn.prepareStatement("DELETE FROM gc_events WHERE ts < ?").use { ps ->
                ps.setLong(1, before); ps.executeUpdate()
            }
        }
    }

    private fun queryTable(table: String, from: Long, to: Long): List<MetricSnapshot> {
        val result = mutableListOf<MetricSnapshot>()
        conn.prepareStatement(
            """SELECT ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms,
               cpu_pct, sys_mem_used, sys_mem_total, disk_used_gb, disk_total_gb,
               player_count, entity_count, loaded_chunks, ping_p50, ping_p95
               FROM $table WHERE ts >= ? AND ts <= ? ORDER BY ts"""
        ).use { ps ->
            ps.setLong(1, from); ps.setLong(2, to)
            ps.executeQuery().use { rs ->
                while (rs.next()) {
                    result += MetricSnapshot(
                        timestamp     = rs.getLong("ts"),
                        tps1          = rs.getDouble("tps1"),
                        tps5          = rs.getDouble("tps5"),
                        tps15         = rs.getDouble("tps15"),
                        tickTimeMs    = rs.getDouble("tick_ms"),
                        memUsedMb     = rs.getLong("mem_used"),
                        memTotalMb    = rs.getLong("mem_total"),
                        memMaxMb      = rs.getLong("mem_max"),
                        uptimeMs      = rs.getLong("uptime_ms"),
                        cpuPercent    = rs.getObject("cpu_pct")?.let { rs.getDouble("cpu_pct") },
                        sysMemUsedMb  = rs.getObject("sys_mem_used")?.let { rs.getLong("sys_mem_used") },
                        sysMemTotalMb = rs.getObject("sys_mem_total")?.let { rs.getLong("sys_mem_total") },
                        diskUsedGb    = rs.getObject("disk_used_gb")?.let { rs.getLong("disk_used_gb") },
                        diskTotalGb   = rs.getObject("disk_total_gb")?.let { rs.getLong("disk_total_gb") },
                        playerCount   = rs.getObject("player_count")?.let { rs.getInt("player_count") } ?: 0,
                        entityCount   = rs.getObject("entity_count")?.let { rs.getInt("entity_count") } ?: 0,
                        loadedChunks  = rs.getObject("loaded_chunks")?.let { rs.getInt("loaded_chunks") } ?: 0,
                        pingP50       = rs.getObject("ping_p50")?.let { rs.getInt("ping_p50") },
                        pingP95       = rs.getObject("ping_p95")?.let { rs.getInt("ping_p95") },
                    )
                }
            }
        }
        return result
    }

    private data class MetricSource(val table: String, val from: Long, val to: Long)

    private fun bucketSizeMs(windowMinutes: Int): Long {
        val targetPoints = 600L
        val windowMs = windowMinutes * 60_000L
        return ((windowMs + targetPoints - 1) / targetPoints).coerceAtLeast(1_000L)
    }

    private fun queryBucketed(sources: List<MetricSource>, origin: Long, bucketMs: Long): List<MetricSnapshot> {
        if (sources.isEmpty()) return emptyList()
        val unionSql = sources.joinToString("\nUNION ALL\n") { source ->
            """SELECT ts, tps1, tps5, tps15, tick_ms, mem_used, mem_total, mem_max, uptime_ms,
                      cpu_pct, sys_mem_used, sys_mem_total, disk_used_gb, disk_total_gb,
                      player_count, entity_count, loaded_chunks, ping_p50, ping_p95
               FROM ${source.table}
               WHERE ts >= ? AND ts < ?"""
        }
        val sql = """
            SELECT CAST((ts - ?) / ? AS INTEGER) * ? + ? AS bucket_ts,
                   AVG(tps1) AS tps1,
                   AVG(tps5) AS tps5,
                   AVG(tps15) AS tps15,
                   AVG(tick_ms) AS tick_ms,
                   CAST(AVG(mem_used) AS INTEGER) AS mem_used,
                   CAST(AVG(mem_total) AS INTEGER) AS mem_total,
                   CAST(AVG(mem_max) AS INTEGER) AS mem_max,
                   CAST(AVG(uptime_ms) AS INTEGER) AS uptime_ms,
                   AVG(cpu_pct) AS cpu_pct,
                   CAST(AVG(sys_mem_used) AS INTEGER) AS sys_mem_used,
                   CAST(AVG(sys_mem_total) AS INTEGER) AS sys_mem_total,
                   CAST(AVG(disk_used_gb) AS INTEGER) AS disk_used_gb,
                   CAST(AVG(disk_total_gb) AS INTEGER) AS disk_total_gb,
                   CAST(AVG(player_count) AS INTEGER) AS player_count,
                   CAST(AVG(entity_count) AS INTEGER) AS entity_count,
                   CAST(AVG(loaded_chunks) AS INTEGER) AS loaded_chunks,
                   CAST(AVG(ping_p50) AS INTEGER) AS ping_p50,
                   CAST(AVG(ping_p95) AS INTEGER) AS ping_p95
            FROM (
                $unionSql
            )
            GROUP BY bucket_ts
            ORDER BY bucket_ts
        """.trimIndent()

        val result = mutableListOf<MetricSnapshot>()
        conn.prepareStatement(sql).use { ps ->
            var idx = 1
            ps.setLong(idx++, origin)
            ps.setLong(idx++, bucketMs)
            ps.setLong(idx++, bucketMs)
            ps.setLong(idx++, origin)
            for (source in sources) {
                ps.setLong(idx++, source.from)
                ps.setLong(idx++, source.to)
            }
            ps.executeQuery().use { rs ->
                while (rs.next()) {
                    result += MetricSnapshot(
                        timestamp     = rs.getLong("bucket_ts"),
                        tps1          = rs.getDouble("tps1"),
                        tps5          = rs.getDouble("tps5"),
                        tps15         = rs.getDouble("tps15"),
                        tickTimeMs    = rs.getDouble("tick_ms"),
                        memUsedMb     = rs.getLong("mem_used"),
                        memTotalMb    = rs.getLong("mem_total"),
                        memMaxMb      = rs.getLong("mem_max"),
                        uptimeMs      = rs.getLong("uptime_ms"),
                        cpuPercent    = rs.getObject("cpu_pct")?.let { rs.getDouble("cpu_pct") },
                        sysMemUsedMb  = rs.getObject("sys_mem_used")?.let { rs.getLong("sys_mem_used") },
                        sysMemTotalMb = rs.getObject("sys_mem_total")?.let { rs.getLong("sys_mem_total") },
                        diskUsedGb    = rs.getObject("disk_used_gb")?.let { rs.getLong("disk_used_gb") },
                        diskTotalGb   = rs.getObject("disk_total_gb")?.let { rs.getLong("disk_total_gb") },
                        playerCount   = rs.getObject("player_count")?.let { rs.getInt("player_count") } ?: 0,
                        entityCount   = rs.getObject("entity_count")?.let { rs.getInt("entity_count") } ?: 0,
                        loadedChunks  = rs.getObject("loaded_chunks")?.let { rs.getInt("loaded_chunks") } ?: 0,
                        pingP50       = rs.getObject("ping_p50")?.let { rs.getInt("ping_p50") },
                        pingP95       = rs.getObject("ping_p95")?.let { rs.getInt("ping_p95") },
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
