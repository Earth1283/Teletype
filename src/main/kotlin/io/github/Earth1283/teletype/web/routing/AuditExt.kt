package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.plugins.origin
import io.ktor.server.routing.RoutingContext

fun RoutingContext.auditAsync(plugin: Teletype, action: String, detail: String) {
    val actor = call.principal<JWTPrincipal>()?.payload?.subject ?: "unknown"
    val ip    = call.request.origin.remoteAddress
    plugin.auditAsync(action, detail, actor, ip)
}
