package io.github.Earth1283.teletype.multiplex

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class ProxyRateLimiter {
    // routeId -> ip -> connection count in current 60s window
    private val counters = ConcurrentHashMap<String, ConcurrentHashMap<String, AtomicInteger>>()
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "teletype-mux-ratelimit").also { it.isDaemon = true }
    }

    init {
        scheduler.scheduleAtFixedRate({ counters.clear() }, 60, 60, TimeUnit.SECONDS)
    }

    fun allow(routeId: String, ip: String, limitPerMinute: Int): Boolean {
        val routeCounters = counters.getOrPut(routeId) { ConcurrentHashMap() }
        val count = routeCounters.getOrPut(ip) { AtomicInteger(0) }
        return count.incrementAndGet() <= limitPerMinute
    }

    fun shutdown() {
        scheduler.shutdownNow()
    }
}
