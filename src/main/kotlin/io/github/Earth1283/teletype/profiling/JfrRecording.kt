package io.github.Earth1283.teletype.profiling

import kotlinx.serialization.Serializable

@Serializable
enum class RecordingType { CONTINUOUS_DUMP, MANUAL }

@Serializable
enum class RecordingStatus { RUNNING, COMPLETE, FAILED }

@Serializable
data class JfrRecording(
    val id: String,
    val name: String,
    val type: RecordingType,
    val status: RecordingStatus,
    val startTimeMs: Long,
    val endTimeMs: Long? = null,
    val sizeBytes: Long? = null,
    val path: String,
    val template: String,
)

@Serializable
data class GcPause(val startMs: Long, val durationMs: Double, val cause: String)

@Serializable
data class CpuSample(val timeMs: Long, val machineTotal: Double, val jvmUser: Double)

@Serializable
data class LockStat(val className: String, val totalBlockedMs: Double, val count: Long)

@Serializable
data class HeapSummary(val reservedMb: Double, val usedMb: Double)

@Serializable
data class ParsedProfile(
    val durationMs: Long,
    val gcPauses: List<GcPause>,
    val cpuSamples: List<CpuSample>,
    val topLocks: List<LockStat>,
    val heapSummary: HeapSummary?,
    val threadCount: Int,
)

@Serializable
data class StartRecordingRequest(
    val name: String = "",
    val template: String = "default",
    val maxDurationSec: Long = 0,
    val maxSizeMb: Long = 0,
)

@Serializable
data class StartContinuousRequest(
    val maxDiskMb: Long? = null,
    val maxAgeSec: Long? = null,
    val template: String? = null,
    val dumpOnExit: Boolean? = null,
)

@Serializable
data class ProfilingConfigStatus(
    val maxDiskMb: Long,
    val maxAgeSec: Long,
    val template: String,
    val dumpOnExit: Boolean,
    val outputDir: String,
)

@Serializable
data class ProfilingRecordingsStatus(
    val outputDir: String,
    val maxTotalDiskMb: Long,
    val totalSizeBytes: Long,
)

@Serializable
data class ProfilingStatus(
    val jfrAvailable: Boolean,
    val profilingEnabled: Boolean,
    val continuousEnabled: Boolean,
    val continuousRunning: Boolean,
    val config: ProfilingConfigStatus,
    val recordings: ProfilingRecordingsStatus,
)
