package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.multiplex.PortForward
import io.github.Earth1283.teletype.multiplex.RouteMapping
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.model.StatusResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import java.util.UUID

fun Route.networkRoutes(plugin: Teletype) {
    val store = plugin.routeStore
    val fwdStore = plugin.portForwardStore
    val cfg = plugin.teletypeConfig

    get("/status") {
        call.respond(mapOf(
            "muxEnabled" to cfg.multiplexGamePort,
            "muxPort" to cfg.multiplexPort,
            "networkEnabled" to cfg.networkEnabled,
            "maxRoutes" to cfg.networkMaxRoutes,
            "defaultRateLimitPerMinute" to cfg.networkDefaultRateLimitPerMinute,
            "routeCount" to store.getRoutes().size,
            "maxPortForwards" to cfg.networkMaxPortForwards,
            "forwardCount" to fwdStore.getForwards().size,
        ))
    }

    route("/routes") {
        get {
            call.respond(store.getRoutes())
        }

        post {
            val req = call.receive<RouteMapping>()
            if (req.prefix.isBlank() || !req.prefix.startsWith("/")) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Prefix must start with /")); return@post
            }
            if (req.targetPort !in 1..65535) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid port")); return@post
            }
            if (store.getRoutes().size >= cfg.networkMaxRoutes) {
                call.respond(HttpStatusCode.BadRequest,
                    ErrorResponse("Route limit reached (max ${cfg.networkMaxRoutes})")); return@post
            }
            val effectiveRateLimit = if (req.rateLimitPerMinute <= 0)
                cfg.networkDefaultRateLimitPerMinute else req.rateLimitPerMinute
            val route = req.copy(id = UUID.randomUUID().toString(), rateLimitPerMinute = effectiveRateLimit)
            store.addRoute(route)
            call.respond(HttpStatusCode.Created, route)
            auditAsync(plugin, "network_route_create", "${route.prefix} → :${route.targetPort}")
        }

        put("/{id}") {
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            store.getRoute(id)
                ?: return@put call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
            val req = call.receive<RouteMapping>()
            if (req.prefix.isBlank() || !req.prefix.startsWith("/")) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Prefix must start with /")); return@put
            }
            if (req.targetPort !in 1..65535) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid port")); return@put
            }
            val effectiveRateLimit = if (req.rateLimitPerMinute <= 0)
                cfg.networkDefaultRateLimitPerMinute else req.rateLimitPerMinute
            val updated = req.copy(id = id, rateLimitPerMinute = effectiveRateLimit)
            store.updateRoute(updated)
            call.respond(updated)
            auditAsync(plugin, "network_route_update", "${updated.prefix} → :${updated.targetPort}")
        }

        delete("/{id}") {
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            if (!store.removeRoute(id)) {
                return@delete call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
            }
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "network_route_delete", id)
        }
    }

    route("/forwards") {
        get {
            call.respond(fwdStore.getForwards())
        }

        post {
            val req = call.receive<PortForward>()
            if (req.externalPort !in 1..65535) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid external port")); return@post
            }
            if (req.targetPort !in 1..65535) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid target port")); return@post
            }
            if (fwdStore.getForwards().size >= cfg.networkMaxPortForwards) {
                call.respond(HttpStatusCode.BadRequest,
                    ErrorResponse("Port forward limit reached (max ${cfg.networkMaxPortForwards})")); return@post
            }
            val forward = req.copy(id = java.util.UUID.randomUUID().toString())
            fwdStore.addForward(forward)
            plugin.portForwardManager.bind(forward)
            call.respond(HttpStatusCode.Created, forward)
            auditAsync(plugin, "network_forward_create", ":${forward.externalPort} → :${forward.targetPort}")
        }

        put("/{id}") {
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            fwdStore.getForward(id)
                ?: return@put call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
            val req = call.receive<PortForward>()
            if (req.externalPort !in 1..65535) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid external port")); return@put
            }
            if (req.targetPort !in 1..65535) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid target port")); return@put
            }
            val updated = req.copy(id = id)
            fwdStore.updateForward(updated)
            plugin.portForwardManager.bind(updated)
            call.respond(updated)
            auditAsync(plugin, "network_forward_update", ":${updated.externalPort} → :${updated.targetPort}")
        }

        delete("/{id}") {
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            if (!fwdStore.removeForward(id)) {
                return@delete call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
            }
            plugin.portForwardManager.unbind(id)
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "network_forward_delete", id)
        }
    }
}
