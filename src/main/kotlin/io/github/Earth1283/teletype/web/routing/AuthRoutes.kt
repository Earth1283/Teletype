package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.ChallengeResponse
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.model.PollResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.origin
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID

fun Route.authRoutes(plugin: Teletype) {
    post("/challenge") {
        val challenge = plugin.challengeStore.createChallenge(call.request.origin.remoteAddress)
        call.respond(
            ChallengeResponse(
                uuid = challenge.uuid.toString(),
                message = "Run `tty verify ${challenge.uuid}` in the Minecraft console to authenticate"
            )
        )
    }

    get("/poll/{uuid}") {
        val uuidStr = call.parameters["uuid"]
            ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing uuid"))

        val uuid = runCatching { UUID.fromString(uuidStr) }.getOrNull()
            ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid uuid"))

        val challenge = plugin.challengeStore.getPending(uuid)
            ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Challenge not found or expired"))

        val jwt = withTimeoutOrNull(30_000) {
            challenge.deferred.await()
        }

        if (jwt != null) {
            call.respond(PollResponse(status = "verified", token = jwt))
            plugin.challengeStore.remove(uuid)
        } else {
            call.respond(HttpStatusCode.Accepted, PollResponse(status = "pending"))
        }
    }
}
