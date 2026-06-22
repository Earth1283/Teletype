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

    init {
        // Sample at 1 Hz on the Bukkit main thread.
        object : BukkitRunnable() {
            override fun run() {
                val rt  = Runtime.getRuntime()
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
                    memMaxMb   = rt.maxMemory()   / 1_048_576L,
                    uptimeMs   = ManagementFactory.getRuntimeMXBean().uptime
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
