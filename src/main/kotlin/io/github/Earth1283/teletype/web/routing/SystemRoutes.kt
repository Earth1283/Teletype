package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.StatusResponse
import io.ktor.http.ContentType
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import org.bukkit.Bukkit

fun Route.systemRoutes(plugin: Teletype) {
    post("/restart") {
        Bukkit.getScheduler().runTask(plugin, Runnable {
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "restart")
        })
        call.respond(StatusResponse("restarting"))
        auditAsync(plugin, "server_restart", "triggered via Teletype UI")
    }

    get("/thread-dump") {
        val sb = StringBuilder()
        val now = java.time.Instant.now()
        sb.appendLine("Thread Dump — $now")
        sb.appendLine("JVM: ${System.getProperty("java.vm.name")} ${System.getProperty("java.version")}")
        sb.appendLine("Total active threads: ${Thread.activeCount()}")
        sb.appendLine("=".repeat(80))
        sb.appendLine()
        @Suppress("DEPRECATION")
        Thread.getAllStackTraces()
            .entries
            .sortedBy { it.key.name }
            .forEach { (thread, frames) ->
                @Suppress("DEPRECATION")
                sb.appendLine("\"${thread.name}\" #${thread.id} state=${thread.state}${if (thread.isDaemon) " daemon" else ""} prio=${thread.priority}")
                if (frames.isEmpty()) {
                    sb.appendLine("\t(no stack trace available)")
                } else {
                    frames.forEach { frame -> sb.appendLine("\tat $frame") }
                }
                sb.appendLine()
            }
        call.respondText(sb.toString(), ContentType.Text.Plain)
    }
}
