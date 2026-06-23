package io.github.Earth1283.teletype.metrics

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.MetricSnapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.bukkit.Bukkit
import org.bukkit.scheduler.BukkitRunnable
import java.lang.management.ManagementFactory

private const val MAX_SNAPSHOTS = 900  // 15 minutes at 1 Hz

class MetricsCollector(plugin: Teletype, private val db: MetricsDatabase, scope: CoroutineScope) {

    private val buffer = ArrayDeque<MetricSnapshot>(MAX_SNAPSHOTS + 1)

    // Ring buffer that feeds SQLite flush; DROP_OLDEST on overflow so the main thread never blocks.
    private val flushChannel = Channel<MetricSnapshot>(capacity = 128, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    @Volatile var latest: MetricSnapshot? = null

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

        // Sample at 1 Hz on the Bukkit main thread.
        object : BukkitRunnable() {
            override fun run() {
                val rt  = Runtime.getRuntime()
                val tps = Bukkit.getTPS()
                val tps1 = tps[0].coerceIn(0.0, 20.0)

                val cpuLoad = osMx?.cpuLoad
                val cpuPercent = cpuLoad?.let { if (it < 0.0) -1.0 else it * 100.0 }
                val sysMemTotal = osMx?.totalMemorySize
                val sysMemFree  = osMx?.freeMemorySize
                val sysMemUsedMb  = if (sysMemTotal != null && sysMemFree != null) (sysMemTotal - sysMemFree) / 1_048_576L else null
                val sysMemTotalMb = sysMemTotal?.div(1_048_576L)
                val diskTotal = diskRoot.totalSpace
                val diskFree  = diskRoot.freeSpace
                val diskUsedGb  = if (diskTotal > 0) (diskTotal - diskFree) / 1_073_741_824L else null
                val diskTotalGb = if (diskTotal > 0) diskTotal / 1_073_741_824L else null

                val onlinePlayers = Bukkit.getOnlinePlayers()
                val worlds = Bukkit.getWorlds()
                val entityCount = worlds.sumOf { it.entities.size }
                val loadedChunks = worlds.sumOf { it.loadedChunks.size }

                val pings = if (pingMethod != null) {
                    onlinePlayers.mapNotNull { p ->
                        runCatching { pingMethod.invoke(p) as Int }.getOrNull()
                    }.sorted()
                } else emptyList()
                val pingP50 = pings.getOrNull(pings.size / 2)
                val pingP95 = pings.getOrNull(((pings.size - 1) * 95 / 100).coerceAtLeast(0))

                val snap = MetricSnapshot(
                    timestamp     = System.currentTimeMillis(),
                    tps1          = tps1,
                    tps5          = tps[1].coerceIn(0.0, 20.0),
                    tps15         = tps[2].coerceIn(0.0, 20.0),
                    tickTimeMs    = Bukkit.getServer().tickTimes.takeLast(20).average() / 1_000_000.0,
                    memUsedMb     = (rt.totalMemory() - rt.freeMemory()) / 1_048_576L,
                    memTotalMb    = rt.totalMemory() / 1_048_576L,
                    memMaxMb      = rt.maxMemory()   / 1_048_576L,
                    uptimeMs      = ManagementFactory.getRuntimeMXBean().uptime,
                    cpuPercent    = cpuPercent,
                    sysMemUsedMb  = sysMemUsedMb,
                    sysMemTotalMb = sysMemTotalMb,
                    diskUsedGb    = diskUsedGb,
                    diskTotalGb   = diskTotalGb,
                    playerCount   = onlinePlayers.size,
                    entityCount   = entityCount,
                    loadedChunks  = loadedChunks,
                    pingP50       = pingP50,
                    pingP95       = pingP95,
                )

                latest = snap

                synchronized(buffer) {
                    if (buffer.size >= MAX_SNAPSHOTS) buffer.removeFirst()
                    buffer.addLast(snap)
                }

                flushChannel.trySend(snap)  // non-blocking; drops if channel is full
            }
        }.runTaskTimer(plugin, 0L, 20L)  // 20 ticks = 1 second

        // Coroutine: drain the channel and write to SQLite every 15 seconds.
        scope.launch {
            val batch = mutableListOf<MetricSnapshot>()
            while (isActive) {
                delay(15_000)
                while (true) {
                    batch += flushChannel.tryReceive().getOrNull() ?: break
                }
                if (batch.isNotEmpty()) {
                    db.insert(batch.toList())
                    batch.clear()
                }
            }
        }
    }

    /** In-memory history for windows up to 15 minutes (1-second resolution). */
    fun history(windowMinutes: Int): List<MetricSnapshot> {
        val max = (windowMinutes * 60).coerceIn(1, MAX_SNAPSHOTS)
        return synchronized(buffer) { buffer.takeLast(max).toList() }
    }
}
