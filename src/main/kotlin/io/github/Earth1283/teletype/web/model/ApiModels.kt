package io.github.Earth1283.teletype.web.model

import kotlinx.serialization.Serializable

@Serializable
data class ServerStatus(
    val name: String,
    val version: String,
    val onlinePlayers: Int,
    val maxPlayers: Int,
    val tps: List<Double>,
    val worldCount: Int,
    val pluginCount: Int,
)

@Serializable
data class PlayerInfo(
    val name: String,
    val uuid: String,
    val world: String,
    val health: Double,
    val foodLevel: Int,
    val level: Int,
    val gameMode: String,
    val ping: Int,
    val isOp: Boolean,
)

@Serializable
data class ExecuteRequest(val command: String)

@Serializable
data class ChallengeResponse(val uuid: String, val message: String)

@Serializable
data class TokenResponse(val token: String)

@Serializable
data class PollResponse(val status: String, val token: String? = null)

@Serializable
data class FileEntry(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val size: Long,
    val lastModified: Long
)

@Serializable
data class RenameRequest(val from: String, val to: String)

@Serializable
data class CopyRequest(val from: String, val to: String)

@Serializable
data class FetchRequest(val url: String, val destPath: String, val fileName: String? = null)

@Serializable
data class DecompressRequest(val path: String, val destPath: String)

@Serializable
data class MetricSnapshot(
    val timestamp: Long,
    val tps1: Double,
    val tps5: Double,
    val tps15: Double,
    val tickTimeMs: Double,
    val memUsedMb: Long,
    val memTotalMb: Long,
    val memMaxMb: Long,
    val uptimeMs: Long,
    val cpuPercent: Double? = null,
    val sysMemUsedMb: Long? = null,
    val sysMemTotalMb: Long? = null,
    val diskUsedGb: Long? = null,
    val diskTotalGb: Long? = null,
    val playerCount: Int = 0,
    val entityCount: Int = 0,
    val loadedChunks: Int = 0,
    val pingP50: Int? = null,
    val pingP95: Int? = null,
)

@Serializable
data class GcEvent(
    val ts: Long,
    val name: String,
    val action: String,
    val cause: String,
    val durationMs: Long,
)

@Serializable
data class PlayerEvent(
    val ts: Long,
    val uuid: String,
    val name: String,
    val action: String,
)

@Serializable
data class NetworkStatus(
    val muxEnabled: Boolean,
    val muxPort: Int,
    val networkEnabled: Boolean,
    val maxRoutes: Int,
    val defaultRateLimitPerMinute: Int,
    val routeCount: Int,
    val maxPortForwards: Int,
    val forwardCount: Int,
)

@Serializable
data class GlanceConfig(
    val tpsNominalMin: Double,
    val tpsDegradedMin: Double,
    val tickNominalMaxMs: Int,
    val tickDegradedMaxMs: Int,
    val memNominalMaxPct: Int,
    val memDegradedMaxPct: Int,
    val anomalyTpsSigma: Double,
    val anomalyTickSigma: Double,
    val anomalyMemorySigma: Double,
)

@Serializable
data class ErrorResponse(val error: String)

@Serializable
data class StatusResponse(val status: String)
