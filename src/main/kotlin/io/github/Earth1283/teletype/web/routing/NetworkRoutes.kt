package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.multiplex.PortForward
import io.github.Earth1283.teletype.multiplex.RouteMapping
import io.github.Earth1283.teletype.web.model.NetworkStatus
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

private val VALID_PORTS = 1..65535

fun Route.networkRoutes(plugin: Teletype) {
    val store = plugin.routeStore
    val fwdStore = plugin.portForwardStore
    val cfg = plugin.teletypeConfig

    fun validatedRoute(req: RouteMapping, id: String): RouteMapping {
        if (!req.prefix.startsWith("/")) badRequest("Prefix must start with /")
        if (req.shadowsPanel) badRequest("Prefix ${req.prefix} would hide the Teletype panel (/, /api, /ws, /assets are reserved)")
        if (req.targetPort !in VALID_PORTS) badRequest("Invalid port")
        val rateLimit = req.rateLimitPerMinute.takeIf { it > 0 } ?: cfg.networkDefaultRateLimitPerMinute
        return req.copy(id = id, rateLimitPerMinute = rateLimit)
    }

    fun reservedPorts(): Map<Int, String> = buildMap {
        put(cfg.port, "the Teletype web port")
        if (cfg.tlsEnabled) put(cfg.tlsHttpsPort, "the Teletype HTTPS port")
        put(plugin.server.port, "the Minecraft port")
        if (cfg.multiplexGamePort) put(cfg.multiplexPort, "the multiplexer port")
    }

    fun validatedForward(req: PortForward, id: String): PortForward {
        if (req.externalPort !in VALID_PORTS) badRequest("Invalid external port")
        if (req.targetPort !in VALID_PORTS) badRequest("Invalid target port")
        reservedPorts()[req.externalPort]?.let { conflict("Port ${req.externalPort} is already used by $it") }
        fwdStore.getForwards().find { it.id != id && it.externalPort == req.externalPort }
            ?.let { conflict("Port ${req.externalPort} is already forwarded by ${it.label.ifBlank { it.id }}") }
        return req.copy(id = id)
    }

    fun bindOrFail(forward: PortForward) {
        plugin.portForwardManager.bind(forward).onFailure { e ->
            conflict("Could not listen on port ${forward.externalPort}: ${e.message ?: "bind failed"}")
        }
    }

    get("/status") {
        call.respond(NetworkStatus(
            muxEnabled = cfg.multiplexGamePort,
            muxPort = cfg.multiplexPort,
            networkEnabled = cfg.networkEnabled,
            maxRoutes = cfg.networkMaxRoutes,
            defaultRateLimitPerMinute = cfg.networkDefaultRateLimitPerMinute,
            routeCount = store.getRoutes().size,
            maxPortForwards = cfg.networkMaxPortForwards,
            forwardCount = fwdStore.getForwards().size,
        ))
    }

    route("/routes") {
        get { call.respond(store.getRoutes()) }

        post {
            if (store.getRoutes().size >= cfg.networkMaxRoutes) badRequest("Route limit reached (max ${cfg.networkMaxRoutes})")
            val route = validatedRoute(call.receive(), UUID.randomUUID().toString())
            store.addRoute(route)
            call.respond(HttpStatusCode.Created, route)
            auditAsync(plugin, "network_route_create", "${route.prefix} → :${route.targetPort}")
        }

        put("/{id}") {
            val id = call.pathParam("id")
            store.getRoute(id) ?: notFound()
            val updated = validatedRoute(call.receive(), id)
            store.updateRoute(updated)
            call.respond(updated)
            auditAsync(plugin, "network_route_update", "${updated.prefix} → :${updated.targetPort}")
        }

        delete("/{id}") {
            val id = call.pathParam("id")
            if (!store.removeRoute(id)) notFound()
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "network_route_delete", id)
        }
    }

    route("/forwards") {
        get { call.respond(fwdStore.getForwards()) }

        post {
            if (fwdStore.getForwards().size >= cfg.networkMaxPortForwards)
                badRequest("Port forward limit reached (max ${cfg.networkMaxPortForwards})")
            val forward = validatedForward(call.receive(), UUID.randomUUID().toString())
            bindOrFail(forward)
            fwdStore.addForward(forward)
            call.respond(HttpStatusCode.Created, forward)
            auditAsync(plugin, "network_forward_create", ":${forward.externalPort} → :${forward.targetPort}")
        }

        put("/{id}") {
            val id = call.pathParam("id")
            val previous = fwdStore.getForward(id) ?: notFound()
            val updated = validatedForward(call.receive(), id)
            try {
                bindOrFail(updated)
            } catch (e: ApiException) {
                plugin.portForwardManager.bind(previous)
                throw e
            }
            fwdStore.updateForward(updated)
            call.respond(updated)
            auditAsync(plugin, "network_forward_update", ":${updated.externalPort} → :${updated.targetPort}")
        }

        delete("/{id}") {
            val id = call.pathParam("id")
            if (!fwdStore.removeForward(id)) notFound()
            plugin.portForwardManager.unbind(id)
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "network_forward_delete", id)
        }
    }
}
