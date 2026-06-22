package io.github.Earth1283.teletype.audit

import kotlinx.serialization.Serializable
import org.sqlite.SQLiteDataSource
import java.io.File
import java.sql.Connection

@Serializable
data class AuditEntry(
    val id: Long = 0,
    val ts: Long,
    val actor: String,
    val ip: String,
    val action: String,
    val detail: String,
)

class AuditLog(dataFolder: File) {
    private val conn: Connection

    init {
        dataFolder.mkdirs()
        val ds = SQLiteDataSource()
        ds.url = "jdbc:sqlite:${File(dataFolder, "teletype-audit.db").absolutePath}"
        conn = ds.connection
        conn.createStatement().use { stmt ->
            stmt.executeUpdate("PRAGMA journal_mode=WAL")
            stmt.executeUpdate("PRAGMA synchronous=NORMAL")
            stmt.executeUpdate("""
                CREATE TABLE IF NOT EXISTS audit_log (
                  id     INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts     INTEGER NOT NULL,
                  actor  TEXT    NOT NULL,
                  ip     TEXT    NOT NULL,
                  action TEXT    NOT NULL,
                  detail TEXT    NOT NULL
                )
            """.trimIndent())
            stmt.executeUpdate("CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_log(ts)")
            stmt.executeUpdate("CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor)")
            stmt.executeUpdate("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)")
        }
    }

    @Synchronized
    fun insert(entry: AuditEntry) {
        conn.prepareStatement(
            "INSERT INTO audit_log (ts, actor, ip, action, detail) VALUES (?,?,?,?,?)"
        ).use { ps ->
            ps.setLong(1, entry.ts)
            ps.setString(2, entry.actor)
            ps.setString(3, entry.ip)
            ps.setString(4, entry.action)
            ps.setString(5, entry.detail)
            ps.executeUpdate()
        }
    }

    @Synchronized
    fun query(
        limit: Int = 100,
        offset: Int = 0,
        actionFilter: String? = null,
        actorFilter: String? = null,
        since: Long? = null,
    ): List<AuditEntry> {
        val conditions = mutableListOf<String>()
        if (actionFilter != null) conditions += "action = ?"
        if (actorFilter  != null) conditions += "actor = ?"
        if (since        != null) conditions += "ts >= ?"
        val where = if (conditions.isEmpty()) "" else "WHERE ${conditions.joinToString(" AND ")}"
        val sql = "SELECT id, ts, actor, ip, action, detail FROM audit_log $where ORDER BY ts DESC LIMIT ? OFFSET ?"
        return conn.prepareStatement(sql).use { ps ->
            var idx = 1
            if (actionFilter != null) ps.setString(idx++, actionFilter)
            if (actorFilter  != null) ps.setString(idx++, actorFilter)
            if (since        != null) ps.setLong(idx++, since)
            ps.setInt(idx++, limit)
            ps.setInt(idx,   offset)
            ps.executeQuery().use { rs ->
                val result = mutableListOf<AuditEntry>()
                while (rs.next()) {
                    result += AuditEntry(
                        id     = rs.getLong("id"),
                        ts     = rs.getLong("ts"),
                        actor  = rs.getString("actor"),
                        ip     = rs.getString("ip"),
                        action = rs.getString("action"),
                        detail = rs.getString("detail"),
                    )
                }
                result
            }
        }
    }

    fun close() { try { conn.close() } catch (_: Exception) {} }
}
