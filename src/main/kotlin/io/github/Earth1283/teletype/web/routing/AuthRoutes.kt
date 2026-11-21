package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.auth.ChallengeStore.PollResult
import io.github.Earth1283.teletype.web.model.ChallengeResponse
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.model.PollResponse
import io.ktor.http.HttpStatusCode
import io.ktor.http.auth.HttpAuthHeader
import io.ktor.server.auth.parseAuthorizationHeader
import io.ktor.server.plugins.origin
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import java.util.UUID

fun Route.authRoutes(plugin: Teletype) {
    post("/challenge") {
        val challenge = plugin.challengeStore.createChallenge(call.request.origin.remoteAddress)
            ?: throw ApiException(HttpStatusCode.TooManyRequests, "Too many pending login challenges — try again in a few minutes")
        call.respond(
            ChallengeResponse(
                uuid = challenge.uuid.toString(),
                message = "Run `tty verify ${challenge.uuid}` in the Minecraft console to authenticate",
                pollToken = challenge.pollToken,
            )
        )
    }

    get("/poll/{uuid}") {
        val uuidStr = call.parameters["uuid"]
            ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing uuid"))

        val uuid = runCatching { UUID.fromString(uuidStr) }.getOrNull()
            ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid uuid"))

        val auth = call.request.parseAuthorizationHeader() as? HttpAuthHeader.Single
        val pollToken = auth?.takeIf { it.authScheme.equals("Bearer", ignoreCase = true) }?.blob
        when (val result = pollToken?.let { plugin.challengeStore.poll(uuid, it) }) {
            is PollResult.Verified -> call.respond(PollResponse(status = "verified", token = result.jwt))
            PollResult.Pending -> call.respond(HttpStatusCode.Accepted, PollResponse(status = "pending"))
            null -> call.respond(HttpStatusCode.NotFound, ErrorResponse("Challenge not found or expired"))
        }
    }
}
