package io.github.Earth1283.teletype.web.routing

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall

class ApiException(val status: HttpStatusCode, override val message: String) : RuntimeException(message)

fun badRequest(message: String): Nothing = throw ApiException(HttpStatusCode.BadRequest, message)
fun notFound(message: String = "Not found"): Nothing = throw ApiException(HttpStatusCode.NotFound, message)
fun conflict(message: String): Nothing = throw ApiException(HttpStatusCode.Conflict, message)
fun forbidden(message: String): Nothing = throw ApiException(HttpStatusCode.Forbidden, message)

fun ApplicationCall.pathParam(name: String): String =
    parameters[name]?.takeIf { it.isNotBlank() } ?: badRequest("Missing $name")
