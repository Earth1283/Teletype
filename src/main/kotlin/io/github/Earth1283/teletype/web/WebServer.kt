package io.github.Earth1283.teletype.web

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.routing.apiRoutes
import io.github.Earth1283.teletype.web.routing.authRoutes
import io.github.Earth1283.teletype.web.routing.consoleWebSocket
import io.github.Earth1283.teletype.web.routing.fileRoutes
import io.github.Earth1283.teletype.web.routing.glanceRoutes
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.auth.Authentication
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.jwt.jwt
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.http.ContentType
import io.ktor.server.http.content.staticResources
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.get
import io.ktor.server.netty.Netty
import io.ktor.server.netty.NettyApplicationEngine
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import kotlinx.serialization.json.Json

class WebServer(private val plugin: Teletype) {
    private var server: EmbeddedServer<NettyApplicationEngine, NettyApplicationEngine.Configuration>? = null

    val isRunning: Boolean get() = server != null

    fun start() {
        val secret = plugin.teletypeConfig.jwtSecret
        val port = plugin.teletypeConfig.port

        server = embeddedServer(Netty, port = port) {
            install(WebSockets) {
                pingPeriodMillis = 30_000L
                timeoutMillis = 60_000L
            }

            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; encodeDefaults = true })
            }

            install(CORS) {
                anyHost()
                allowHeader(HttpHeaders.Authorization)
                allowHeader(HttpHeaders.ContentType)
                allowMethod(HttpMethod.Options)
                allowMethod(HttpMethod.Put)
                allowMethod(HttpMethod.Delete)
                allowMethod(HttpMethod.Patch)
            }

            install(Authentication) {
                jwt("auth-jwt") {
                    realm = "Teletype"
                    verifier(
                        JWT.require(Algorithm.HMAC256(secret))
                            .withIssuer("teletype")
                            .build()
                    )
                    validate { credential -> JWTPrincipal(credential.payload) }
                    challenge { _, _ ->
                        call.respond(HttpStatusCode.Unauthorized, ErrorResponse("Unauthorized — provide a valid Bearer token"))
                    }
                }
            }

            install(StatusPages) {
                exception<Throwable> { call, cause ->
                    plugin.logger.warning("Unhandled exception in web server: ${cause.message}")
                    call.respond(HttpStatusCode.InternalServerError, ErrorResponse(cause.message ?: "Internal error"))
                }
            }

            routing {
                // Serve the React SPA from classpath webroot/
                staticResources("/", "webroot")
                // SPA catch-all: any unmatched path returns index.html for client-side routing
                get("{...}") {
                    val bytes = this::class.java.classLoader
                        .getResourceAsStream("webroot/index.html")?.readBytes()
                        ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                    call.respondBytes(bytes, ContentType.Text.Html)
                }

                // Unauthenticated auth routes
                route("/api/auth") {
                    authRoutes(plugin)
                }

                // REST API routes require a valid JWT via Bearer header
                authenticate("auth-jwt") {
                    route("/api") {
                        apiRoutes(plugin)
                        route("/files") { fileRoutes(plugin) }
                        route("/glance") { glanceRoutes(plugin) }
                    }
                }

                // WebSocket: browsers can't send custom headers — validates JWT via ?token= query param
                webSocket("/ws/console") {
                    consoleWebSocket(plugin)
                }
            }
        }.start(wait = false)

        plugin.logger.info("Teletype web server started on port $port")
    }

    fun stop() {
        server?.stop(1000, 5000)
        server = null
        plugin.logger.info("Teletype web server stopped")
    }
}
