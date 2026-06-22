package io.github.Earth1283.teletype.config

import io.github.Earth1283.teletype.Teletype
import java.io.File
import java.util.UUID

class TeletypeConfig(private val plugin: Teletype) {
    private val config get() = plugin.config

    // Read nested key first; fall back to flat legacy key.
    private fun str(nested: String, legacy: String, default: String): String =
        config.getString(nested)?.takeIf { it.isNotBlank() }
            ?: config.getString(legacy)?.takeIf { it.isNotBlank() }
            ?: default
    private fun bool(key: String, default: Boolean) = config.getBoolean(key, default)
    private fun double(key: String, default: Double) = config.getDouble(key, default)

    // ── Server ────────────────────────────────────────────────────────────────
    val port: Int get() =
        if (config.contains("server.port")) config.getInt("server.port", 8080)
        else config.getInt("web-port", 8080)
    val corsOrigins: List<String> get() = config.getStringList("server.cors-origins")
    val maxWebSocketConnections: Int get() = config.getInt("server.max-websocket-connections", 8)
    val multiplexGamePort: Boolean get() = bool("server.multiplex-game-port", false)
    val multiplexPort: Int get() = config.getInt("server.multiplex-port", 25565)

    // ── TLS ───────────────────────────────────────────────────────────────────
    val tlsEnabled: Boolean get() = bool("server.tls.enabled", false)
    val tlsHttpsPort: Int get() = config.getInt("server.https-port", 8443)
    val tlsMode: String get() = config.getString("server.tls.mode") ?: "auto"
    val tlsKeystorePath: String get() = config.getString("server.tls.keystore-path") ?: ""
    val tlsKeystorePassword: String get() = config.getString("server.tls.keystore-password") ?: ""
    val tlsKeyAlias: String get() = config.getString("server.tls.key-alias") ?: "teletype"
    val tlsKeyPassword: String get() = config.getString("server.tls.key-password") ?: ""
    val tlsHttpRedirect: Boolean get() = bool("server.tls.http-redirect", true)

    // ── Rate limiting ─────────────────────────────────────────────────────────
    val rateLimitEnabled: Boolean get() = bool("rate-limit.enabled", true)
    val rateLimitAuthRequestsPerMin: Int get() = config.getInt("rate-limit.auth.requests-per-minute", 10)
    val rateLimitApiRequestsPerMin: Int get() = config.getInt("rate-limit.api.requests-per-minute", 300)
    val rateLimitExecuteRequestsPerMin: Int get() = config.getInt("rate-limit.execute.requests-per-minute", 30)

    // ── Auth ──────────────────────────────────────────────────────────────────
    val jwtSecret: String by lazy {
        var secret = str("auth.jwt-secret", "jwt-secret", "")
        if (secret.isBlank()) {
            secret = UUID.randomUUID().toString().replace("-", "") +
                    UUID.randomUUID().toString().replace("-", "")
            config.set("auth.jwt-secret", secret)
            plugin.saveConfig()
        }
        secret
    }

    val jwtExpiryMinutes: Long get() {
        if (config.contains("auth.jwt-expiry-minutes"))
            return config.getLong("auth.jwt-expiry-minutes", 1440)
        return config.getLong("jwt-expiry-hours", 24) * 60
    }
    val jwtExpiryHours: Long get() = jwtExpiryMinutes / 60

    val challengeTtlSeconds: Long get() = config.getLong("auth.challenge-ttl-seconds", 300)
    val requireOp: Boolean get() = bool("auth.require-op", true)

    // ── Console ───────────────────────────────────────────────────────────────
    val consoleEnabled: Boolean get() = bool("console.enabled", true)
    val consoleReplayBufferLines: Int get() = config.getInt("console.replay-buffer-lines", 1000)
    val consoleMaxLineLength: Int get() = config.getInt("console.max-line-length", 2048)

    // ── Metrics ───────────────────────────────────────────────────────────────
    val metricsEnabled: Boolean get() = bool("metrics.enabled", true)
    val metricsSampleIntervalTicks: Long get() = config.getLong("metrics.sample-interval-ticks", 20)
    val metricsInMemoryWindowSeconds: Int get() = config.getInt("metrics.in-memory-window-seconds", 900)
    val metricsSqliteEnabled: Boolean get() = bool("metrics.sqlite.enabled", true)
    val metricsFlushIntervalSeconds: Long get() = config.getLong("metrics.sqlite.flush-interval-seconds", 15)
    val retentionEnabled: Boolean get() = bool("metrics.sqlite.retention.enabled", true)
    val retentionDownsample1sAfterHours: Int get() = config.getInt("metrics.sqlite.retention.downsample-1s-after-hours", 24)
    val retentionDownsample1mAfterDays: Int get() = config.getInt("metrics.sqlite.retention.downsample-1m-after-days", 7)
    val retentionDelete15mAfterDays: Int get() = config.getInt("metrics.sqlite.retention.delete-15m-after-days", 90)

    // ── Actions ───────────────────────────────────────────────────────────────
    val actionsEnabled: Boolean get() = bool("actions.enabled", true)
    val actionsSchedulingEnabled: Boolean get() = bool("actions.scheduling-enabled", true)
    val actionsQuickActionsCategoryId: String get() =
        config.getString("actions.quick-actions-category-id") ?: "quick-actions"
    val actionsMaxSnippets: Int get() = config.getInt("actions.max-snippets", 200)
    val actionsMaxScheduled: Int get() = config.getInt("actions.max-scheduled-actions", 50)

    // ── Files ─────────────────────────────────────────────────────────────────
    val filesEnabled: Boolean get() = bool("files.enabled", true)
    val filesRoot: File by lazy {
        val v = str("files.root", "files-root", "")
        if (v.isBlank() || v == ".") File(System.getProperty("user.dir")) else File(v)
    }
    val filesMaxEditSizeMb: Int get() = config.getInt("files.max-edit-size-mb", 4)
    val filesEditableExtensions: Set<String> get() =
        config.getStringList("files.editable-extensions").map { it.lowercase() }.toSet()

    // ── Glance thresholds ─────────────────────────────────────────────────────
    val tpsNominalMin: Double   get() = double("glance.tps.nominal-min", 19.0)
    val tpsDegradedMin: Double  get() = double("glance.tps.degraded-min", 15.0)
    val tickNominalMaxMs: Int   get() = config.getInt("glance.tick-time.nominal-max-ms", 50)
    val tickDegradedMaxMs: Int  get() = config.getInt("glance.tick-time.degraded-max-ms", 100)
    val memNominalMaxPct: Int   get() = config.getInt("glance.memory.nominal-max-pct", 65)
    val memDegradedMaxPct: Int  get() = config.getInt("glance.memory.degraded-max-pct", 85)
    val anomalyTpsSigma: Double    get() = double("glance.anomaly.tps-sigma", 2.0)
    val anomalyTickSigma: Double   get() = double("glance.anomaly.tick-sigma", 2.0)
    val anomalyMemorySigma: Double get() = double("glance.anomaly.memory-sigma", 2.5)
}
