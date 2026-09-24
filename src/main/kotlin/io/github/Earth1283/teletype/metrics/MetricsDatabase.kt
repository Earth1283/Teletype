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
import java.sql.ResultSet
import java.util.concurrent.ConcurrentHashMap

class MetricsDatabase(dataFolder: File) {

    companion object {
        private const val MAX_PLAYER_EVENTS = 1_000
        private const val MAX_GC_EVENTS = 1_000
        // Kept below the 30s frontend poll interval so a fresh point always
        // shows up within one client refetch; absorbs the case where several
        // clients (or the same client's overlapping range switches) hit the
        // same window while a bucketed query over days of rows is expensive.
        private const val HISTORY_CACHE_TTL_MS = 20_000L
        private const val RAW_HISTORY_MAX_MINUTES = 60
        private val METRIC_TABLES = listOf("metrics_1s", "metrics_1m", "metrics_15m")
        private val INTEGER_COLUMNS = listOf(
            "mem_used", "mem_total", "mem_max", "uptime_ms", "sys_mem_used", "sys_mem_total",
            "disk_used_gb", "disk_total_gb", "player_count", "entity_count", "loaded_chunks", "ping_p50", "ping_p95",
        )
        private val VALUE_COLUMNS = listOf(
            "tps1", "tps5", "tps15", "tick_ms", "mem_used", "mem_total", "mem_max", "uptime_ms",
            "cpu_pct", "sys_mem_used", "sys_mem_total", "disk_used_gb", "disk_total_gb",
            "player_count", "entity_count", "loaded_chunks", "ping_p50", "ping_p95",
        )
        private val ALL_COLUMNS = (listOf("ts") + VALUE_COLUMNS).joinToString(", ")

        private fun averagedColumns(): String = VALUE_COLUMNS.joinToString(", ") { col ->
            if (col in INTEGER_COLUMNS) "CAST(AVG($col) AS INTEGER) AS $col" else "AVG($col) AS $col"
        }

        private inline fun Connection.inTransaction(block: () -> Unit) {
            autoCommit = false
            try {
                block()
                commit()
            } catch (e: Exception) {
                rollback()
                throw e
            } finally {
                autoCommit = true
            }
        }
    }

    private data class HistoryCacheEntry(val data: List<MetricSnapshot>, val computedAt: Long)
    private val historyCache = ConcurrentHashMap<Int, HistoryCacheEntry>()

    // Two connections so dashboard reads (history/gcEvents/playerEvents) never queue
    // behind the periodic write flush or nightly retention downsampling — WAL mode
    // (enabled below) allows one writer and readers to proceed concurrently at the
    // SQLite level, but a single shared JDBC Connection would still serialize them.
    private val writeMutex = Mutex()
    private val readMutex = Mutex()
    private val conn: Connection
    private val readConn: Connection

    init {
        dataFolder.mkdirs()
        val ds = SQLiteDataSource()
        ds.url = "jdbc:sqlite:${File(dataFolder, "teletype-metrics.db").absolutePath}"
        conn = ds.connection
        readConn = ds.connection
        conn.createStatement().use { stmt ->
            stmt.executeUpdate("PRAGMA journal_mode=WAL")
            stmt.executeUpdate("PRAGMA synchronous=NORMAL")
            stmt.executeUpdate("PRAGMA cache_size=-8000")
            for (table in METRIC_TABLES) {
                stmt.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS $table (
                      ts         INTEGER PRIMARY KEY,
                      tps1       REAL, tps5 REAL, tps15 REAL,
                      tick_ms    REAL,
                      mem_used   INTEGER, mem_total INTEGER, mem_max INTEGER,
                      uptime_ms  INTEGER
                    )
                """.trimIndent())
                stmt.executeUpdate("DROP INDEX IF EXISTS idx_${table}_ts")
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
        for (table in METRIC_TABLES) {
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
        writeMutex.withLock {
            withContext(Dispatchers.IO) {
                val placeholders = List(VALUE_COLUMNS.size + 1) { "?" }.joinToString(",")
                conn.inTransaction {
                    conn.prepareStatement("INSERT OR IGNORE INTO metrics_1s ($ALL_COLUMNS) VALUES ($placeholders)").use { ps ->
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
                }
            }
        }
    }

    suspend fun insertGcEvents(events: List<GcEvent>) {
        if (events.isEmpty()) return
        writeMutex.withLock {
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

    suspend fun history(windowMinutes: Int): List<MetricSnapshot> {
        fun fresh() = historyCache[windowMinutes]?.takeIf {
            System.currentTimeMillis() - it.computedAt < HISTORY_CACHE_TTL_MS
        }
        fresh()?.let { return it.data }

        return readMutex.withLock {
            withContext(Dispatchers.IO) {
                fresh()?.let { return@withContext it.data }

                val now = System.currentTimeMillis()
                val from = now - windowMinutes * 60_000L
                val bucketMs = if (windowMinutes <= RAW_HISTORY_MAX_MINUTES) null else bucketSizeMs(windowMinutes)
                val result = queryAllTiers(from, now, bucketMs)

                historyCache[windowMinutes] = HistoryCacheEntry(result, System.currentTimeMillis())
                result
            }
        }
    }

    suspend fun downsampleToMinute(before: Long) = downsample("metrics_1s", "metrics_1m", 60_000L, before)

    suspend fun downsampleTo15Min(before: Long) = downsample("metrics_1m", "metrics_15m", 900_000L, before)

    private suspend fun downsample(sourceTable: String, targetTable: String, bucketMs: Long, before: Long) = writeMutex.withLock {
        withContext(Dispatchers.IO) {
            val cutoff = (before / bucketMs) * bucketMs
            conn.inTransaction {
                conn.prepareStatement("""
                    INSERT OR IGNORE INTO $targetTable ($ALL_COLUMNS)
                    SELECT (ts / $bucketMs) * $bucketMs, ${averagedColumns()}
                    FROM $sourceTable
                    WHERE ts < ?
                    GROUP BY (ts / $bucketMs)
                """.trimIndent()).use { ps ->
                    ps.setLong(1, cutoff)
                    ps.executeUpdate()
                }
                conn.prepareStatement("DELETE FROM $sourceTable WHERE ts < ?").use { ps ->
                    ps.setLong(1, cutoff)
                    ps.executeUpdate()
                }
            }
        }
    }

    suspend fun insertPlayerEvent(ts: Long, uuid: String, name: String, action: String) = writeMutex.withLock {
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

    suspend fun playerEvents(from: Long, to: Long): List<PlayerEvent> = readMutex.withLock {
        withContext(Dispatchers.IO) {
            // Capped and taken from the newest end of the range — an unbounded result on a busy
            // server over a multi-day window can reach thousands of rows, and the frontend renders
            // one marker per event, which freezes the chart. Most-recent events are the useful ones.
            val result = mutableListOf<PlayerEvent>()
            readConn.prepareStatement(
                "SELECT ts, uuid, name, action FROM player_events WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?"
            ).use { ps ->
                ps.setLong(1, from); ps.setLong(2, to); ps.setInt(3, MAX_PLAYER_EVENTS)
                ps.executeQuery().use { rs ->
                    while (rs.next()) result += PlayerEvent(
                        ts     = rs.getLong("ts"),
                        uuid   = rs.getString("uuid"),
                        name   = rs.getString("name"),
                        action = rs.getString("action"),
                    )
                }
            }
            result.sortedBy { it.ts }
        }
    }

    suspend fun gcEvents(from: Long, to: Long): List<GcEvent> = readMutex.withLock {
        withContext(Dispatchers.IO) {
            // Capped and taken from the newest end of the range, same rationale as
            // playerEvents — an unbounded multi-day query can return thousands of rows.
            val result = mutableListOf<GcEvent>()
            readConn.prepareStatement(
                "SELECT ts, name, action, cause, duration_ms FROM gc_events WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?"
            ).use { ps ->
                ps.setLong(1, from); ps.setLong(2, to); ps.setInt(3, MAX_GC_EVENTS)
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
            result.sortedBy { it.ts }
        }
    }

    suspend fun prunePlayerEvents(before: Long) = writeMutex.withLock {
        withContext(Dispatchers.IO) {
            conn.prepareStatement("DELETE FROM player_events WHERE ts < ?").use { ps ->
                ps.setLong(1, before); ps.executeUpdate()
            }
        }
    }

    suspend fun pruneGcEvents(before: Long) = writeMutex.withLock {
        withContext(Dispatchers.IO) {
            conn.prepareStatement("DELETE FROM gc_events WHERE ts < ?").use { ps ->
                ps.setLong(1, before); ps.executeUpdate()
            }
        }
    }

    suspend fun pruneMetrics15m(before: Long) = writeMutex.withLock {
        withContext(Dispatchers.IO) {
            conn.prepareStatement("DELETE FROM metrics_15m WHERE ts < ?").use { ps ->
                ps.setLong(1, before); ps.executeUpdate()
            }
        }
    }

    private fun queryAllTiers(from: Long, to: Long, bucketMs: Long?): List<MetricSnapshot> {
        val union = METRIC_TABLES.joinToString("\nUNION ALL\n") { "SELECT $ALL_COLUMNS FROM $it WHERE ts >= ? AND ts <= ?" }
        val sql = if (bucketMs == null) {
            "SELECT * FROM ($union) ORDER BY ts"
        } else {
            """
            SELECT CAST((ts - ?) / ? AS INTEGER) * ? + ? AS ts, ${averagedColumns()}
            FROM ($union)
            GROUP BY 1
            ORDER BY 1
            """.trimIndent()
        }

        return readConn.prepareStatement(sql).use { ps ->
            var idx = 1
            if (bucketMs != null) {
                ps.setLong(idx++, from)
                ps.setLong(idx++, bucketMs)
                ps.setLong(idx++, bucketMs)
                ps.setLong(idx++, from)
            }
            repeat(METRIC_TABLES.size) {
                ps.setLong(idx++, from)
                ps.setLong(idx++, to)
            }
            ps.executeQuery().use { rs -> buildList { while (rs.next()) add(rs.toSnapshot()) } }
        }
    }

    private fun ResultSet.toSnapshot() = MetricSnapshot(
        timestamp     = getLong("ts"),
        tps1          = getDouble("tps1"),
        tps5          = getDouble("tps5"),
        tps15         = getDouble("tps15"),
        tickTimeMs    = getDouble("tick_ms"),
        memUsedMb     = getLong("mem_used"),
        memTotalMb    = getLong("mem_total"),
        memMaxMb      = getLong("mem_max"),
        uptimeMs      = getLong("uptime_ms"),
        cpuPercent    = nullableDouble("cpu_pct"),
        sysMemUsedMb  = nullableLong("sys_mem_used"),
        sysMemTotalMb = nullableLong("sys_mem_total"),
        diskUsedGb    = nullableLong("disk_used_gb"),
        diskTotalGb   = nullableLong("disk_total_gb"),
        playerCount   = nullableLong("player_count")?.toInt() ?: 0,
        entityCount   = nullableLong("entity_count")?.toInt() ?: 0,
        loadedChunks  = nullableLong("loaded_chunks")?.toInt() ?: 0,
        pingP50       = nullableLong("ping_p50")?.toInt(),
        pingP95       = nullableLong("ping_p95")?.toInt(),
    )

    private fun ResultSet.nullableDouble(column: String): Double? = getDouble(column).takeUnless { wasNull() }
    private fun ResultSet.nullableLong(column: String): Long? = getLong(column).takeUnless { wasNull() }

    private fun bucketSizeMs(windowMinutes: Int): Long {
        val targetPoints = 600L
        val windowMs = windowMinutes * 60_000L
        return ((windowMs + targetPoints - 1) / targetPoints).coerceAtLeast(1_000L)
    }

    fun close() {
        try { conn.close() } catch (_: Exception) {}
        try { readConn.close() } catch (_: Exception) {}
    }
}
