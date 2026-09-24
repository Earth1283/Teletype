package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.profiling.StartContinuousRequest
import io.github.Earth1283.teletype.profiling.StartRecordingRequest
import io.github.Earth1283.teletype.web.model.DownloadTokenResponse
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.model.StatusResponse
import io.ktor.http.ContentDisposition
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.createRouteScopedPlugin
import io.ktor.server.request.httpMethod
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.profilingRoutes(plugin: Teletype) {
    val mgr = plugin.jfrManager

    install(createRouteScopedPlugin("TeletypeProfilingGate") {
        onCall { call ->
            when {
                !plugin.teletypeConfig.profilingEnabled ->
                    call.respond(HttpStatusCode.Forbidden, ErrorResponse("Profiling is disabled (profiling.enabled: false)"))
                !mgr.isAvailable && call.request.httpMethod == HttpMethod.Post ->
                    call.respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("JFR not available on this JVM"))
            }
        }
    }) {}

    fun <T> attempt(failure: HttpStatusCode, fallbackMessage: String, block: () -> T): T =
        runCatching(block).getOrElse { throw ApiException(failure, it.message ?: fallbackMessage) }

    get("/status") { call.respond(mgr.getStatus()) }

    get("/recordings") { call.respond(mgr.getRecordings()) }

    route("/continuous") {
        post("/start") {
            val req = runCatching { call.receive<StartContinuousRequest>() }.getOrDefault(StartContinuousRequest())
            attempt(HttpStatusCode.InternalServerError, "Failed to start") { mgr.startContinuous(req) }
            call.respond(mgr.getStatus())
            auditAsync(plugin, "profiling_continuous_start", "continuous recording started")
        }

        post("/stop") {
            attempt(HttpStatusCode.InternalServerError, "Failed to stop") { mgr.stopContinuous() }
            call.respond(StatusResponse("stopped"))
            auditAsync(plugin, "profiling_continuous_stop", "continuous recording stopped")
        }

        post("/dump") {
            val name = runCatching { call.receive<Map<String, String>>() }.getOrDefault(emptyMap())["name"]
            val recording = attempt(HttpStatusCode.InternalServerError, "Failed to dump") { mgr.dumpContinuous(name) }
            call.respond(HttpStatusCode.Created, recording)
            auditAsync(plugin, "profiling_dump", "dumped to ${recording.name}")
        }
    }

    route("/recording") {
        post("/start") {
            val req = runCatching { call.receive<StartRecordingRequest>() }.getOrDefault(StartRecordingRequest())
            val recording = attempt(HttpStatusCode.InternalServerError, "Failed to start recording") { mgr.startNamedRecording(req) }
            call.respond(HttpStatusCode.Created, recording)
            auditAsync(plugin, "profiling_recording_start", recording.name)
        }

        route("/{id}") {
            post("/stop") {
                val recording = attempt(HttpStatusCode.BadRequest, "Failed to stop") { mgr.stopNamedRecording(call.pathParam("id")) }
                call.respond(recording)
                auditAsync(plugin, "profiling_recording_stop", recording.name)
            }

            delete {
                val id = call.pathParam("id")
                if (!mgr.deleteRecording(id)) notFound("Recording not found")
                call.respond(StatusResponse("deleted"))
                auditAsync(plugin, "profiling_recording_delete", id)
            }

            get("/download") {
                val id = call.pathParam("id")
                val file = mgr.getRecordingFile(id) ?: notFound("Recording file not found")
                val rec = mgr.getRecordings().find { it.id == id } ?: notFound("Recording not found")
                call.response.header(
                    HttpHeaders.ContentDisposition,
                    ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, "${rec.name}.jfr").toString()
                )
                call.respondFile(file)
            }

            post("/download-token") {
                val id = call.pathParam("id")
                val file = mgr.getRecordingFile(id) ?: notFound("Recording file not found")
                val rec = mgr.getRecordings().find { it.id == id } ?: notFound("Recording not found")
                val token = plugin.webServer.downloadTokens.issue(file, "${rec.name}.jfr")
                call.respond(DownloadTokenResponse(token, "/api/download/$token"))
            }

            get("/events") {
                val id = call.pathParam("id")
                call.respond(runCatching { mgr.parseEvents(id) }.getOrElse { badRequest(it.message ?: "Failed to parse events") })
            }
        }
    }
}
