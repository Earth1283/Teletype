package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

fun Route.statsRoutes(plugin: Teletype) {
    get("/player-events") {
        val minutes = call.request.queryParameters["minutes"]
            ?.toIntOrNull()?.coerceIn(1, 43_200) ?: 60
        val now  = System.currentTimeMillis()
        val from = now - minutes * 60_000L
        call.respond(plugin.metricsDatabase.playerEvents(from, now))
    }
}
