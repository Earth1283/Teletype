package io.github.Earth1283.teletype.profiling

import io.github.Earth1283.teletype.Teletype
import jdk.jfr.Configuration
import jdk.jfr.FlightRecorder
import jdk.jfr.Recording
import jdk.jfr.RecordingState
import jdk.jfr.consumer.RecordedObject
import jdk.jfr.consumer.RecordingFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Duration
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

private val UNSAFE_NAME_CHARS = Regex("[^a-zA-Z0-9._-]")

class JfrManager(private val plugin: Teletype) {

    private val lock = ReentrantLock()
    private var jfrAvailable = false
    private var continuousRecording: Recording? = null
    private var appliedContinuousReq: StartContinuousRequest = StartContinuousRequest()

    private val recordings = ConcurrentHashMap<String, JfrRecording>()
    private val activeManual = ConcurrentHashMap<String, Recording>()
    private val parseCache = ConcurrentHashMap<String, ParsedProfile>()

    val isAvailable: Boolean get() = jfrAvailable

    fun init() {
        try {
            // Referencing Recording::class only proves the jdk.jfr module is on the classpath,
            // not that recording actually works (e.g. -XX:-FlightRecorder, non-HotSpot JVMs).
            // FlightRecorder.isAvailable() is the real capability check.
            jfrAvailable = FlightRecorder.isAvailable()
            if (!jfrAvailable) {
                plugin.logger.warning("[Profiling] JFR unavailable on this JVM — profiling disabled")
                return
            }
            scanExistingRecordings()
            if (plugin.teletypeConfig.profilingEnabled && plugin.teletypeConfig.profilingContinuousEnabled) {
                startContinuousLocked(StartContinuousRequest())
            }
        } catch (e: Throwable) {
            plugin.logger.warning("[Profiling] JFR unavailable on this JVM — profiling disabled (${e.message})")
        }
    }

    private fun safeDir(relativePath: String): File {
        val base = plugin.dataFolder.canonicalFile
        val resolved = File(base, relativePath).canonicalFile
        check(resolved.path.startsWith(base.path + File.separator) || resolved.path == base.path) {
            "Output dir escapes plugin data folder"
        }
        resolved.mkdirs()
        return resolved
    }

    private fun safeName(raw: String): String =
        raw.replace(UNSAFE_NAME_CHARS, "_").take(128)

    private fun scanExistingRecordings() {
        val cfg = plugin.teletypeConfig
        val dirs = listOf(
            safeDir(cfg.profilingContinuousOutputDir) to RecordingType.CONTINUOUS_DUMP,
            safeDir(cfg.profilingRecordingsOutputDir) to RecordingType.MANUAL,
        )
        for ((dir, type) in dirs) {
            dir.listFiles { f -> f.isFile && f.extension == "jfr" }?.forEach { file ->
                val id = UUID.randomUUID().toString()
                recordings[id] = JfrRecording(
                    id = id,
                    name = file.nameWithoutExtension,
                    type = type,
                    status = RecordingStatus.COMPLETE,
                    startTimeMs = file.lastModified(),
                    endTimeMs = file.lastModified(),
                    sizeBytes = file.length(),
                    path = file.absolutePath,
                    template = "unknown",
                )
            }
        }
        plugin.logger.info("[Profiling] Scanned ${recordings.size} existing recording(s)")
    }

    fun getStatus(): ProfilingStatus {
        val cfg = plugin.teletypeConfig
        return ProfilingStatus(
            jfrAvailable = jfrAvailable,
            profilingEnabled = cfg.profilingEnabled,
            continuousEnabled = cfg.profilingContinuousEnabled,
            continuousRunning = lock.withLock {
                continuousRecording?.state == RecordingState.RUNNING
            },
            config = ProfilingConfigStatus(
                maxDiskMb = appliedContinuousReq.maxDiskMb ?: cfg.profilingContinuousMaxDiskMb,
                maxAgeSec = appliedContinuousReq.maxAgeSec ?: cfg.profilingContinuousMaxAgeSec,
                template = appliedContinuousReq.template ?: cfg.profilingContinuousTemplate,
                dumpOnExit = appliedContinuousReq.dumpOnExit ?: cfg.profilingContinuousDumpOnExit,
                outputDir = cfg.profilingContinuousOutputDir,
            ),
            recordings = ProfilingRecordingsStatus(
                outputDir = cfg.profilingRecordingsOutputDir,
                maxTotalDiskMb = cfg.profilingRecordingsMaxTotalDiskMb,
                totalSizeBytes = recordings.values.filter { it.status == RecordingStatus.COMPLETE }
                    .mapNotNull { it.sizeBytes }.sum(),
            ),
        )
    }

    fun startContinuous(req: StartContinuousRequest) = lock.withLock {
        check(jfrAvailable) { "JFR not available on this JVM" }
        continuousRecording?.stop()
        continuousRecording?.close()
        continuousRecording = null
        appliedContinuousReq = req
        startContinuousLocked(req)
    }

    private fun startContinuousLocked(req: StartContinuousRequest) {
        val cfg = plugin.teletypeConfig
        val maxDiskMb = req.maxDiskMb ?: cfg.profilingContinuousMaxDiskMb
        val maxAgeSec = req.maxAgeSec ?: cfg.profilingContinuousMaxAgeSec
        val template = req.template ?: cfg.profilingContinuousTemplate
        val dumpOnExit = req.dumpOnExit ?: cfg.profilingContinuousDumpOnExit

        val config = runCatching { Configuration.getConfiguration(template) }
            .getOrElse { Configuration.getConfiguration("default") }
        val rec = Recording(config)
        rec.setToDisk(true)
        rec.maxSize = maxDiskMb * 1024L * 1024L
        rec.maxAge = Duration.ofSeconds(maxAgeSec)

        if (dumpOnExit) {
            val dumpDir = safeDir(cfg.profilingContinuousOutputDir)
            rec.destination = File(dumpDir, "exit-dump.jfr").toPath()
        }
        rec.start()
        continuousRecording = rec
        appliedContinuousReq = req
        plugin.logger.info(
            "[Profiling] Continuous recording started — max-disk=${maxDiskMb}MB max-age=${maxAgeSec}s template=$template dump-on-exit=$dumpOnExit"
        )
    }

    fun stopContinuous() = lock.withLock {
        check(jfrAvailable) { "JFR not available on this JVM" }
        continuousRecording?.stop()
        continuousRecording?.close()
        continuousRecording = null
    }

    fun dumpContinuous(name: String?): JfrRecording = lock.withLock {
        check(jfrAvailable) { "JFR not available on this JVM" }
        val rec = checkNotNull(continuousRecording) { "No continuous recording is running" }
        check(rec.state == RecordingState.RUNNING) { "Continuous recording is not in RUNNING state" }

        val dumpDir = safeDir(plugin.teletypeConfig.profilingContinuousOutputDir)
        val safeName = safeName(name?.takeIf { it.isNotBlank() } ?: "dump-${System.currentTimeMillis()}")
        val file = uniqueFile(dumpDir, safeName, "jfr")
        rec.dump(file.toPath())

        val id = UUID.randomUUID().toString()
        val recording = JfrRecording(
            id = id,
            name = file.nameWithoutExtension,
            type = RecordingType.CONTINUOUS_DUMP,
            status = RecordingStatus.COMPLETE,
            startTimeMs = System.currentTimeMillis(),
            endTimeMs = System.currentTimeMillis(),
            sizeBytes = file.length(),
            path = file.absolutePath,
            template = appliedContinuousReq.template ?: plugin.teletypeConfig.profilingContinuousTemplate,
        )
        recordings[id] = recording
        recording
    }

    fun startNamedRecording(req: StartRecordingRequest): JfrRecording {
        check(jfrAvailable) { "JFR not available on this JVM" }
        val template = req.template.ifBlank { "default" }
        val config = runCatching { Configuration.getConfiguration(template) }
            .getOrElse { Configuration.getConfiguration("default") }

        val rec = Recording(config)
        rec.setToDisk(true)
        if (req.maxDurationSec > 0) rec.duration = Duration.ofSeconds(req.maxDurationSec)
        if (req.maxSizeMb > 0) rec.maxSize = req.maxSizeMb * 1024L * 1024L

        val id = UUID.randomUUID().toString()
        val safeName = safeName(req.name.ifBlank { "recording-${System.currentTimeMillis()}" })
        val recDir = safeDir(plugin.teletypeConfig.profilingRecordingsOutputDir)
        val file = uniqueFile(recDir, safeName, "jfr")
        rec.destination = file.toPath()
        rec.start()

        val recording = JfrRecording(
            id = id,
            name = file.nameWithoutExtension,
            type = RecordingType.MANUAL,
            status = RecordingStatus.RUNNING,
            startTimeMs = System.currentTimeMillis(),
            path = file.absolutePath,
            template = template,
        )
        recordings[id] = recording
        activeManual[id] = rec
        return recording
    }

    fun stopNamedRecording(id: String): JfrRecording {
        val existing = checkNotNull(recordings[id]) { "Recording $id not found" }
        check(existing.status == RecordingStatus.RUNNING) { "Recording $id is not running" }
        val rec = checkNotNull(activeManual.remove(id)) { "Recording $id has no active session" }
        rec.stop()
        rec.close()
        val file = File(existing.path)
        val updated = existing.copy(
            status = RecordingStatus.COMPLETE,
            endTimeMs = System.currentTimeMillis(),
            sizeBytes = if (file.exists()) file.length() else null,
        )
        recordings[id] = updated
        evictOldManualIfNeeded()
        return updated
    }

    fun deleteRecording(id: String): Boolean {
        val rec = recordings.remove(id) ?: return false
        activeManual.remove(id)?.let { r -> runCatching { r.stop(); r.close() } }
        parseCache.remove(id)
        runCatching { File(rec.path).delete() }
        return true
    }

    fun getRecordings(): List<JfrRecording> {
        // Sync status of auto-stopped manual recordings (e.g. duration limit hit)
        for ((id, rec) in activeManual.entries.toList()) {
            if (rec.state != RecordingState.RUNNING) {
                activeManual.remove(id)
                recordings[id]?.let { existing ->
                    val file = File(existing.path)
                    recordings[id] = existing.copy(
                        status = RecordingStatus.COMPLETE,
                        endTimeMs = System.currentTimeMillis(),
                        sizeBytes = if (file.exists()) file.length() else null,
                    )
                }
                runCatching { rec.close() }
            }
        }
        return recordings.values.sortedByDescending { it.startTimeMs }
    }

    fun getRecordingFile(id: String): File? {
        val rec = recordings[id] ?: return null
        return File(rec.path).takeIf { it.exists() }
    }

    suspend fun parseEvents(id: String): ParsedProfile = withContext(Dispatchers.IO) {
        parseCache[id]?.let { return@withContext it }

        val rec = checkNotNull(recordings[id]) { "Recording $id not found" }
        check(rec.status == RecordingStatus.COMPLETE) { "Recording $id is not complete yet" }
        val file = File(rec.path)
        check(file.exists()) { "Recording file not found on disk" }

        val gcPauses = mutableListOf<GcPause>()
        val cpuSamples = mutableListOf<CpuSample>()
        val lockAccum = mutableMapOf<String, Pair<Double, Long>>()
        var lastHeap: HeapSummary? = null
        var maxThreadCount = 0

        RecordingFile(file.toPath()).use { rf ->
            while (rf.hasMoreEvents()) {
                val event = rf.readEvent() ?: continue
                val startMs = event.startTime.toEpochMilli()

                when (event.eventType.name) {
                    "jdk.GarbageCollection" -> if (gcPauses.size < 2000) {
                        val durationMs = event.duration.toMillis().toDouble()
                        val cause = runCatching { event.getString("cause") ?: "unknown" }.getOrDefault("unknown")
                        gcPauses += GcPause(startMs, durationMs, cause)
                    }

                    "jdk.CPULoad" -> if (cpuSamples.size < 3600) {
                        val machine = runCatching { event.getFloat("machineTotal").toDouble() }.getOrDefault(0.0)
                        val jvmU = runCatching { event.getFloat("jvmUser").toDouble() }.getOrDefault(0.0)
                        cpuSamples += CpuSample(startMs, machine, jvmU)
                    }

                    "jdk.JavaMonitorEnter" -> {
                        val cls = runCatching { event.getClass("monitorClass")?.name ?: "unknown" }.getOrDefault("unknown")
                        val ms = event.duration.toMillis().toDouble()
                        val (total, count) = lockAccum.getOrDefault(cls, Pair(0.0, 0L))
                        lockAccum[cls] = Pair(total + ms, count + 1)
                    }

                    "jdk.GCHeapSummary" -> {
                        val used = runCatching { event.getLong("heapUsed") }.getOrDefault(0L)
                        val reserved = runCatching {
                            (event.getValue<Any>("heapSpace") as? RecordedObject)?.getLong("reservedSize") ?: 0L
                        }.getOrDefault(0L)
                        lastHeap = HeapSummary(reserved / 1_048_576.0, used / 1_048_576.0)
                    }

                    "jdk.JavaThreadStatistics" -> {
                        val active = runCatching { event.getLong("activeCount").toInt() }.getOrDefault(0)
                        if (active > maxThreadCount) maxThreadCount = active
                    }
                }
            }
        }

        val topLocks = lockAccum.entries
            .sortedByDescending { it.value.first }
            .take(20)
            .map { (cls, v) -> LockStat(cls, v.first, v.second) }

        val firstMs = gcPauses.firstOrNull()?.startMs ?: cpuSamples.firstOrNull()?.timeMs ?: 0L
        val lastMs = gcPauses.lastOrNull()?.startMs ?: cpuSamples.lastOrNull()?.timeMs ?: 0L

        val result = ParsedProfile(
            durationMs = if (lastMs > firstMs) lastMs - firstMs else 0L,
            gcPauses = gcPauses,
            cpuSamples = cpuSamples,
            topLocks = topLocks,
            heapSummary = lastHeap,
            threadCount = maxThreadCount,
        )
        parseCache[id] = result
        result
    }

    private fun evictOldManualIfNeeded() {
        val maxBytes = plugin.teletypeConfig.profilingRecordingsMaxTotalDiskMb * 1_048_576L
        val manual = recordings.values
            .filter { it.type == RecordingType.MANUAL && it.status == RecordingStatus.COMPLETE }
            .sortedBy { it.startTimeMs }
        var total = manual.mapNotNull { it.sizeBytes }.sum()
        for (rec in manual) {
            if (total <= maxBytes) break
            val sz = rec.sizeBytes ?: 0L
            if (deleteRecording(rec.id)) total -= sz
        }
    }

    private fun uniqueFile(dir: File, baseName: String, ext: String): File {
        var file = File(dir, "$baseName.$ext")
        var counter = 1
        while (file.exists()) {
            file = File(dir, "$baseName-${counter++}.$ext")
        }
        return file
    }

    fun close() {
        lock.withLock {
            activeManual.values.forEach { runCatching { it.stop(); it.close() } }
            activeManual.clear()
            continuousRecording?.let { runCatching { it.stop(); it.close() } }
            continuousRecording = null
        }
    }
}
