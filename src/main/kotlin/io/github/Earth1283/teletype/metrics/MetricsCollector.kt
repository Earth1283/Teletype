package io.github.Earth1283.teletype.metrics

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.MetricSnapshot
import org.bukkit.Bukkit
import org.bukkit.scheduler.BukkitRunnable
import java.lang.management.ManagementFactory

private const val MAX_SNAPSHOTS = 900 // 15 minutes at 1 sample/sec

class MetricsCollector(plugin: Teletype) {
    private val buffer = ArrayDeque<MetricSnapshot>(MAX_SNAPSHOTS + 1)

    @Volatile var latest: MetricSnapshot? = null

    init {
        object : BukkitRunnable() {
            override fun run() {
                val rt = Runtime.getRuntime()
                val tps = Bukkit.getTPS()
                val tps1 = tps[0].coerceIn(0.0, 20.0)

                val snap = MetricSnapshot(
                    timestamp  = System.currentTimeMillis(),
                    tps1       = tps1,
                    tps5       = tps[1].coerceIn(0.0, 20.0),
                    tps15      = tps[2].coerceIn(0.0, 20.0),
                    tickTimeMs = if (tps1 > 0) (1000.0 / tps1.coerceAtMost(20.0)) else 50.0,
                    memUsedMb  = (rt.totalMemory() - rt.freeMemory()) / 1_048_576L,
                    memTotalMb = rt.totalMemory() / 1_048_576L,
                    memMaxMb   = rt.maxMemory() / 1_048_576L,
                    uptimeMs   = ManagementFactory.getRuntimeMXBean().uptime
                )

                latest = snap
                synchronized(buffer) {
                    if (buffer.size >= MAX_SNAPSHOTS) buffer.removeFirst()
                    buffer.addLast(snap)
                }
            }
        }.runTaskTimer(plugin, 0L, 20L) // every 20 ticks = 1 second on the main thread
    }

    fun history(windowMinutes: Int): List<MetricSnapshot> {
        val max = (windowMinutes * 60).coerceIn(1, MAX_SNAPSHOTS)
        return synchronized(buffer) { buffer.takeLast(max).toList() }
    }
}
