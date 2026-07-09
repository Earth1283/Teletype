package io.github.Earth1283.teletype.metrics

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.GcEvent
import io.github.Earth1283.teletype.web.model.MetricSnapshot
import com.sun.management.GarbageCollectionNotificationInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.bukkit.Bukkit
import org.bukkit.scheduler.BukkitRunnable
import java.lang.management.ManagementFactory
import javax.management.Notification
import javax.management.NotificationEmitter
import javax.management.NotificationListener
import javax.management.openmbean.CompositeData

// Avoids the boxing/sublist allocation that LongArray.takeLast(n).average() would
// incur on every sample tick.
private fun averageTailNanos(times: LongArray, tailSize: Int): Double {
    if (times.isEmpty()) return 0.0
    val start = (times.size - tailSize).coerceAtLeast(0)
    var sum = 0.0
    for (i in start until times.size) sum += times[i]
    return sum / (times.size - start)
}

private data class SystemMetricSnapshot(
    val memUsedMb: Long,
    val memTotalMb: Long,
    val memMaxMb: Long,
    val uptimeMs: Long,
    val cpuPercent: Double?,
    val sysMemUsedMb: Long?,
    val sysMemTotalMb: Long?,
    val diskUsedGb: Long?,
    val diskTotalGb: Long?,
)

class MetricsCollector(private val plugin: Teletype, private val db: MetricsDatabase, scope: CoroutineScope) {

    private val maxSnapshots = plugin.teletypeConfig.metricsInMemoryWindowSeconds.coerceAtLeast(1)
    private val sampleIntervalTicks = plugin.teletypeConfig.metricsSampleIntervalTicks.coerceAtLeast(1L)
    private val flushIntervalMs = plugin.teletypeConfig.metricsFlushIntervalSeconds.coerceAtLeast(1L) * 1_000L
    private val heavySampleEvery = (100L / sampleIntervalTicks).coerceAtLeast(1L).toInt()

    private val buffer = ArrayDeque<MetricSnapshot>(maxSnapshots + 1)
    private val gcBuffer = ArrayDeque<GcEvent>(maxSnapshots + 64)

    // Ring buffer that feeds SQLite flush; DROP_OLDEST on overflow so the main thread never blocks.
    private val flushChannel = Channel<MetricSnapshot>(capacity = 128, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private val gcFlushChannel = Channel<GcEvent>(capacity = 256, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    @Volatile var latest: MetricSnapshot? = null
    @Volatile private var latestSystem: SystemMetricSnapshot? = null
    private var sampleCounter = 0
    private var cachedEntityCount = 0
    private var cachedLoadedChunks = 0
    private var cachedPingP50: Int? = null
    private var cachedPingP95: Int? = null
    private val gcListeners = mutableListOf<Pair<NotificationEmitter, NotificationListener>>()

    private val osMx: com.sun.management.OperatingSystemMXBean? = runCatching {
        ManagementFactory.getOperatingSystemMXBean() as com.sun.management.OperatingSystemMXBean
    }.getOrNull()

    private val diskRoot = plugin.server.worldContainer.absoluteFile

    // getPing() is available on Paper forks and modern Spigot (1.17+).
    // Use reflection so we fail gracefully on older servers instead of crashing.
    private val pingMethod = runCatching {
        org.bukkit.entity.Player::class.java.getMethod("getPing")
    }.getOrNull()

    init {
        if (plugin.teletypeConfig.metricsEnabled) {
            installGcListeners()

            val isPaper = runCatching {
                Class.forName("io.papermc.paper.configuration.GlobalConfiguration"); true
            }.getOrDefault(runCatching {
                Class.forName("com.destroystokyo.paper.PaperConfig"); true
            }.getOrDefault(false))

            if (!isPaper) {
                plugin.logger.warning(
                    "[Teletype] Server does not appear to be a Paper fork — " +
                        "player ping metrics will be unavailable. For full analytics support, use Paper or a Paper fork."
                )
            }

            // OS/JVM/disk probes do not need Bukkit state, and disk stat calls can be slow on some hosts.
            // Keep them off the server thread and merge the latest values into the Bukkit sample below.
            scope.launch(Dispatchers.IO) {
                while (isActive) {
                    latestSystem = collectSystemMetrics()
                    delay(sampleIntervalTicks * 50L)
                }
            }

            // Sample Bukkit-owned state on the server thread.
            object : BukkitRunnable() {
                override fun run() {
                    val tps = Bukkit.getTPS()
                    val tps1 = tps[0].coerceIn(0.0, 20.0)
                    val system = latestSystem ?: collectJvmOnlyMetrics()

                    val onlinePlayers = Bukkit.getOnlinePlayers()
                    val refreshHeavyMetrics = sampleCounter++ % heavySampleEvery == 0
                    if (refreshHeavyMetrics) {
                        val worlds = Bukkit.getWorlds()
                        cachedEntityCount = worlds.sumOf { it.entities.size }
                        cachedLoadedChunks = worlds.sumOf { it.loadedChunks.size }

                        val pings = if (pingMethod != null) {
                            onlinePlayers.mapNotNull { p ->
                                runCatching { pingMethod.invoke(p) as Int }.getOrNull()
                            }.sorted()
                        } else emptyList()
                        cachedPingP50 = pings.getOrNull(pings.size / 2)
                        cachedPingP95 = pings.getOrNull(((pings.size - 1) * 95 / 100).coerceAtLeast(0))
                    }

                    val snap = MetricSnapshot(
                        timestamp     = System.currentTimeMillis(),
                        tps1          = tps1,
                        tps5          = tps[1].coerceIn(0.0, 20.0),
                        tps15         = tps[2].coerceIn(0.0, 20.0),
                        tickTimeMs    = averageTailNanos(Bukkit.getServer().tickTimes, 20) / 1_000_000.0,
                        memUsedMb     = system.memUsedMb,
                        memTotalMb    = system.memTotalMb,
                        memMaxMb      = system.memMaxMb,
                        uptimeMs      = system.uptimeMs,
                        cpuPercent    = system.cpuPercent,
                        sysMemUsedMb  = system.sysMemUsedMb,
                        sysMemTotalMb = system.sysMemTotalMb,
                        diskUsedGb    = system.diskUsedGb,
                        diskTotalGb   = system.diskTotalGb,
                        playerCount   = onlinePlayers.size,
                        entityCount   = cachedEntityCount,
                        loadedChunks  = cachedLoadedChunks,
                        pingP50       = cachedPingP50,
                        pingP95       = cachedPingP95,
                    )

                    latest = snap

                    synchronized(buffer) {
                        if (buffer.size >= maxSnapshots) buffer.removeFirst()
                        buffer.addLast(snap)
                    }

                    if (plugin.teletypeConfig.metricsSqliteEnabled) {
                        flushChannel.trySend(snap)  // non-blocking; drops if channel is full
                    }
                }
            }.runTaskTimer(plugin, 0L, sampleIntervalTicks)

            // Coroutine: drain the channel and write to SQLite every 15 seconds.
            if (plugin.teletypeConfig.metricsSqliteEnabled) scope.launch {
                val batch = mutableListOf<MetricSnapshot>()
                val gcBatch = mutableListOf<GcEvent>()
                while (isActive) {
                    delay(flushIntervalMs)
                    while (true) {
                        batch += flushChannel.tryReceive().getOrNull() ?: break
                    }
                    while (true) {
                        gcBatch += gcFlushChannel.tryReceive().getOrNull() ?: break
                    }
                    if (batch.isNotEmpty()) {
                        db.insert(batch.toList())
                        batch.clear()
                    }
                    if (gcBatch.isNotEmpty()) {
                        db.insertGcEvents(gcBatch.toList())
                        gcBatch.clear()
                    }
                }
            }
        }
    }

    private fun installGcListeners() {
        val runtimeStartMs = ManagementFactory.getRuntimeMXBean().startTime
        ManagementFactory.getGarbageCollectorMXBeans().forEach { bean ->
            val emitter = bean as? NotificationEmitter ?: return@forEach
            val listener = NotificationListener { notification: Notification, _ ->
                if (notification.type != GarbageCollectionNotificationInfo.GARBAGE_COLLECTION_NOTIFICATION) return@NotificationListener
                val event = runCatching {
                    val info = GarbageCollectionNotificationInfo.from(notification.userData as CompositeData)
                    GcEvent(
                        ts         = runtimeStartMs + info.gcInfo.endTime,
                        name       = info.gcName,
                        action     = info.gcAction,
                        cause      = info.gcCause,
                        durationMs = info.gcInfo.duration,
                    )
                }.getOrNull() ?: return@NotificationListener

                synchronized(gcBuffer) {
                    if (gcBuffer.size >= maxSnapshots + 64) gcBuffer.removeFirst()
                    gcBuffer.addLast(event)
                }
                if (plugin.teletypeConfig.metricsSqliteEnabled) {
                    gcFlushChannel.trySend(event)
                }
            }

            runCatching {
                emitter.addNotificationListener(listener, null, null)
                gcListeners += emitter to listener
            }.onFailure { e ->
                plugin.logger.fine("[Teletype] Could not attach GC listener to ${bean.name}: ${e.message}")
            }
        }
    }

    private fun collectSystemMetrics(): SystemMetricSnapshot {
        val rt = Runtime.getRuntime()
        val cpuLoad = osMx?.cpuLoad
        val sysMemTotal = osMx?.totalMemorySize
        val sysMemFree = osMx?.freeMemorySize
        val diskTotal = diskRoot.totalSpace
        val diskFree = diskRoot.freeSpace

        return SystemMetricSnapshot(
            memUsedMb = (rt.totalMemory() - rt.freeMemory()) / 1_048_576L,
            memTotalMb = rt.totalMemory() / 1_048_576L,
            memMaxMb = rt.maxMemory() / 1_048_576L,
            uptimeMs = ManagementFactory.getRuntimeMXBean().uptime,
            cpuPercent = cpuLoad?.let { if (it < 0.0) -1.0 else it * 100.0 },
            sysMemUsedMb = if (sysMemTotal != null && sysMemFree != null) {
                (sysMemTotal - sysMemFree) / 1_048_576L
            } else null,
            sysMemTotalMb = sysMemTotal?.div(1_048_576L),
            diskUsedGb = if (diskTotal > 0) (diskTotal - diskFree) / 1_073_741_824L else null,
            diskTotalGb = if (diskTotal > 0) diskTotal / 1_073_741_824L else null,
        )
    }

    private fun collectJvmOnlyMetrics(): SystemMetricSnapshot {
        val rt = Runtime.getRuntime()
        return SystemMetricSnapshot(
            memUsedMb = (rt.totalMemory() - rt.freeMemory()) / 1_048_576L,
            memTotalMb = rt.totalMemory() / 1_048_576L,
            memMaxMb = rt.maxMemory() / 1_048_576L,
            uptimeMs = ManagementFactory.getRuntimeMXBean().uptime,
            cpuPercent = null,
            sysMemUsedMb = null,
            sysMemTotalMb = null,
            diskUsedGb = null,
            diskTotalGb = null,
        )
    }

    /** In-memory history for the requested time window. */
    fun history(windowMinutes: Int): List<MetricSnapshot> {
        val from = System.currentTimeMillis() - windowMinutes.coerceAtLeast(1) * 60_000L
        return synchronized(buffer) { buffer.filter { it.timestamp >= from } }
    }

    fun gcEvents(windowMinutes: Int): List<GcEvent> {
        val from = System.currentTimeMillis() - windowMinutes.coerceAtLeast(1) * 60_000L
        return synchronized(gcBuffer) { gcBuffer.filter { it.ts >= from } }
    }

    fun close() {
        gcListeners.forEach { (emitter, listener) ->
            runCatching { emitter.removeNotificationListener(listener) }
        }
        gcListeners.clear()
    }
}
