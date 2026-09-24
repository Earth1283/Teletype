package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.GlanceConfig
import io.github.Earth1283.teletype.web.model.MetricSnapshot
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

fun Route.glanceRoutes(plugin: Teletype) {
    fun servedFromMemory(windowMinutes: Int) =
        windowMinutes * 60 <= plugin.teletypeConfig.metricsInMemoryWindowSeconds || !plugin.teletypeConfig.metricsSqliteEnabled

    get("/config") {
        val cfg = plugin.teletypeConfig
        call.respond(GlanceConfig(
            tpsNominalMin = cfg.tpsNominalMin,
            tpsDegradedMin = cfg.tpsDegradedMin,
            tickNominalMaxMs = cfg.tickNominalMaxMs,
            tickDegradedMaxMs = cfg.tickDegradedMaxMs,
            memNominalMaxPct = cfg.memNominalMaxPct,
            memDegradedMaxPct = cfg.memDegradedMaxPct,
            anomalyTpsSigma = cfg.anomalyTpsSigma,
            anomalyTickSigma = cfg.anomalyTickSigma,
            anomalyMemorySigma = cfg.anomalyMemorySigma,
        ))
    }

    get("/current") {
        val snap = plugin.metricsCollector.latest
            ?: return@get call.respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("Metrics not ready yet"))
        call.respond(snap)
    }

    get("/history") {
        val window = call.request.queryParameters["window"]?.toIntOrNull()?.coerceIn(1, 525_600) ?: 5
        val since = call.request.queryParameters["since"]?.toLongOrNull()
        val memory = plugin.metricsCollector.history(window)
        val data = if (servedFromMemory(window)) memory else mergeHistory(plugin.metricsDatabase.history(window), memory)
        call.respond(if (since == null) data else data.filter { it.timestamp > since })
    }

    get("/gc-events") {
        val window = call.request.queryParameters["window"]?.toIntOrNull()?.coerceIn(1, 43_200) ?: 5
        val memory = plugin.metricsCollector.gcEvents(window)
        val from = System.currentTimeMillis() - window * 60_000L
        val data = if (servedFromMemory(window)) {
            memory
        } else {
            (plugin.metricsDatabase.gcEvents(from, System.currentTimeMillis()) + memory)
                .distinctBy { "${it.ts}:${it.name}:${it.durationMs}" }
                .sortedBy { it.ts }
        }
        call.respond(data)
    }
}

private fun mergeHistory(persisted: List<MetricSnapshot>, live: List<MetricSnapshot>): List<MetricSnapshot> =
    (persisted + live)
        .associateBy { it.timestamp }
        .values
        .sortedBy { it.timestamp }
