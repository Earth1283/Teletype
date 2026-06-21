package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.ExecuteRequest
import io.github.Earth1283.teletype.web.model.PlayerInfo
import io.github.Earth1283.teletype.web.model.ServerStatus
import io.github.Earth1283.teletype.web.model.StatusResponse
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import org.bukkit.Bukkit

fun Route.apiRoutes(plugin: Teletype) {
    get("/status") {
        val server = Bukkit.getServer()
        call.respond(
            ServerStatus(
                name = server.name,
                version = server.version,
                onlinePlayers = server.onlinePlayers.size,
                maxPlayers = server.maxPlayers,
                tps = Bukkit.getTPS().take(3).toList()
            )
        )
    }

    get("/players") {
        val players = Bukkit.getOnlinePlayers().map {
            PlayerInfo(
                name = it.name,
                uuid = it.uniqueId.toString(),
                world = it.world.name,
                health = it.health
            )
        }
        call.respond(players)
    }

    post("/execute") {
        val body = call.receive<ExecuteRequest>()
        Bukkit.getScheduler().runTask(plugin, Runnable {
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), body.command)
        })
        call.respond(StatusResponse("dispatched"))
    }
}
