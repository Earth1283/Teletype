package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.profiling.StartContinuousRequest
import io.github.Earth1283.teletype.profiling.StartRecordingRequest
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.model.StatusResponse
import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.createRouteScopedPlugin
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

fun Route.profilingRoutes(plugin: Teletype) {
    val mgr = plugin.jfrManager

    install(createRouteScopedPlugin("TeletypeProfilingGate") {
        onCall { call ->
            if (!plugin.teletypeConfig.profilingEnabled) {
                call.respond(HttpStatusCode.Forbidden, ErrorResponse("Profiling is disabled (profiling.enabled: false)"))
            }
        }
    }) {}

    get("/status") {
        call.respond(mgr.getStatus())
    }

    get("/recordings") {
        call.respond(mgr.getRecordings())
    }

    route("/continuous") {
        post("/start") {
            if (!mgr.isAvailable) {
                call.respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("JFR not available on this JVM"))
                return@post
            }
            val req = runCatching { call.receive<StartContinuousRequest>() }.getOrDefault(StartContinuousRequest())
            runCatching { mgr.startContinuous(req) }
                .onSuccess { call.respond(mgr.getStatus()) }
                .onFailure { call.respond(HttpStatusCode.InternalServerError, ErrorResponse(it.message ?: "Failed to start")) }
        }

        post("/stop") {
            if (!mgr.isAvailable) {
                call.respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("JFR not available on this JVM"))
                return@post
            }
            runCatching { mgr.stopContinuous() }
                .onSuccess { call.respond(StatusResponse("stopped")) }
                .onFailure { call.respond(HttpStatusCode.InternalServerError, ErrorResponse(it.message ?: "Failed to stop")) }
            auditAsync(plugin, "profiling_continuous_stop", "continuous recording stopped")
        }

        post("/dump") {
            if (!mgr.isAvailable) {
                call.respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("JFR not available on this JVM"))
                return@post
            }
            val params = runCatching { call.receive<Map<String, String>>() }.getOrDefault(emptyMap())
            val name = params["name"]
            runCatching { mgr.dumpContinuous(name) }
                .onSuccess { recording ->
                    call.respond(HttpStatusCode.Created, recording)
                    auditAsync(plugin, "profiling_dump", "dumped to ${recording.name}")
                }
                .onFailure { call.respond(HttpStatusCode.InternalServerError, ErrorResponse(it.message ?: "Failed to dump")) }
        }
    }

    route("/recording") {
        post("/start") {
            if (!mgr.isAvailable) {
                call.respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("JFR not available on this JVM"))
                return@post
            }
            val req = runCatching { call.receive<StartRecordingRequest>() }.getOrDefault(StartRecordingRequest())
            runCatching { mgr.startNamedRecording(req) }
                .onSuccess { recording ->
                    call.respond(HttpStatusCode.Created, recording)
                    auditAsync(plugin, "profiling_recording_start", recording.name)
                }
                .onFailure { call.respond(HttpStatusCode.InternalServerError, ErrorResponse(it.message ?: "Failed to start recording")) }
        }

        route("/{id}") {
            post("/stop") {
                val id = call.parameters["id"]
                    ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
                runCatching { mgr.stopNamedRecording(id) }
                    .onSuccess { recording ->
                        call.respond(recording)
                        auditAsync(plugin, "profiling_recording_stop", recording.name)
                    }
                    .onFailure { call.respond(HttpStatusCode.BadRequest, ErrorResponse(it.message ?: "Failed to stop")) }
            }

            delete {
                val id = call.parameters["id"]
                    ?: return@delete call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
                if (mgr.deleteRecording(id)) {
                    call.respond(StatusResponse("deleted"))
                    auditAsync(plugin, "profiling_recording_delete", id)
                } else {
                    call.respond(HttpStatusCode.NotFound, ErrorResponse("Recording not found"))
                }
            }

            get("/download") {
                val id = call.parameters["id"]
                    ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
                val file = mgr.getRecordingFile(id)
                    ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Recording file not found"))
                val rec = mgr.getRecordings().find { it.id == id }
                    ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Recording not found"))

                val disposition = ContentDisposition.Attachment
                    .withParameter(ContentDisposition.Parameters.FileName, "${rec.name}.jfr")
                    .toString()
                call.response.header(HttpHeaders.ContentDisposition, disposition)
                call.response.header(HttpHeaders.ContentLength, file.length().toString())

                val bytes = withContext(Dispatchers.IO) { file.readBytes() }
                call.respondBytes(bytes, ContentType.Application.OctetStream)
            }

            get("/events") {
                val id = call.parameters["id"]
                    ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
                runCatching { mgr.parseEvents(id) }
                    .onSuccess { call.respond(it) }
                    .onFailure { call.respond(HttpStatusCode.BadRequest, ErrorResponse(it.message ?: "Failed to parse events")) }
            }
        }
    }
}
