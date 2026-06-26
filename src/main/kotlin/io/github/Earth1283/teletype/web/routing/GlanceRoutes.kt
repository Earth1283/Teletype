package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.MetricSnapshot
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

fun Route.glanceRoutes(plugin: Teletype) {
    get("/current") {
        val snap = plugin.metricsCollector.latest
            ?: return@get call.respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("Metrics not ready yet"))
        call.respond(snap)
    }

    get("/history") {
        // window is in minutes. Larger windows use SQLite, but always merge in
        // the live in-memory tail so partial uptime windows still chart fully.
        val window = call.request.queryParameters["window"]?.toIntOrNull()?.coerceIn(1, 525_600) ?: 5
        val memory = plugin.metricsCollector.history(window)
        val data = if (window <= 15) memory else mergeHistory(plugin.metricsDatabase.history(window), memory)
        call.respond(data)
    }

    get("/gc-events") {
        val window = call.request.queryParameters["window"]?.toIntOrNull()?.coerceIn(1, 43_200) ?: 5
        val memory = plugin.metricsCollector.gcEvents(window)
        val from = System.currentTimeMillis() - window * 60_000L
        val data = if (window <= 15 || !plugin.teletypeConfig.metricsSqliteEnabled) {
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
