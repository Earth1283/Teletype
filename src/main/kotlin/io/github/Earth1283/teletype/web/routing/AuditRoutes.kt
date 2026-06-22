package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

fun Route.auditRoutes(plugin: Teletype) {
    get("/audit") {
        val limit  = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 500) ?: 100
        val offset = call.request.queryParameters["offset"]?.toIntOrNull()?.coerceAtLeast(0) ?: 0
        val action = call.request.queryParameters["action"]?.takeIf { it.isNotBlank() }
        val actor  = call.request.queryParameters["actor"]?.takeIf { it.isNotBlank() }
        val since  = call.request.queryParameters["since"]?.toLongOrNull()

        val entries = withContext(Dispatchers.IO) {
            plugin.auditLog.query(limit, offset, action, actor, since)
        }
        call.respond(entries)
    }
}
