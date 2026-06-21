package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
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
        val window = call.request.queryParameters["window"]?.toIntOrNull()?.coerceIn(1, 15) ?: 5
        call.respond(plugin.metricsCollector.history(window))
    }
}
