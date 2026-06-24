package io.github.Earth1283.teletype.web

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.routing.actionRoutes
import io.github.Earth1283.teletype.web.routing.apiRoutes
import io.github.Earth1283.teletype.web.routing.auditRoutes
import io.github.Earth1283.teletype.web.routing.authRoutes
import io.github.Earth1283.teletype.web.routing.consoleWebSocket
import io.github.Earth1283.teletype.web.routing.fileRoutes
import io.github.Earth1283.teletype.web.routing.glanceRoutes
import io.github.Earth1283.teletype.web.routing.networkRoutes
import io.github.Earth1283.teletype.web.routing.statsRoutes
import io.github.Earth1283.teletype.web.routing.systemRoutes
import io.ktor.http.ContentType
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
import io.ktor.server.engine.connector
import io.ktor.server.engine.embeddedServer
import io.ktor.server.engine.sslConnector
import io.ktor.server.netty.Netty
import io.ktor.server.netty.NettyApplicationEngine
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.httpsredirect.HttpsRedirect
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimit
import io.ktor.server.plugins.ratelimit.RateLimitName
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import kotlinx.serialization.json.Json
import kotlin.time.Duration.Companion.minutes

class WebServer(private val plugin: Teletype) {
    private var server: EmbeddedServer<NettyApplicationEngine, NettyApplicationEngine.Configuration>? = null

    val isRunning: Boolean get() = server != null

    fun start() {
        val cfg = plugin.teletypeConfig
        val secret = cfg.jwtSecret
        val httpPort = cfg.port
        val tlsEnabled = cfg.tlsEnabled
        val httpsPort = cfg.tlsHttpsPort
        val keyAlias = cfg.tlsKeyAlias
        val keystorePass = cfg.tlsKeystorePassword.ifBlank { "teletype-tls" }
        val keyPass = cfg.tlsKeyPassword.ifBlank { "teletype-tls" }

        val keyStore = if (tlsEnabled) TlsManager(plugin).loadKeyStore() else null

        server = embeddedServer(Netty, configure = {
            connector { port = httpPort }
            if (tlsEnabled && keyStore != null) {
                sslConnector(
                    keyStore = keyStore,
                    keyAlias = keyAlias,
                    keyStorePassword = { keystorePass.toCharArray() },
                    privateKeyPassword = { keyPass.toCharArray() }
                ) {
                    port = httpsPort
                }
            }
        }) {
            if (tlsEnabled && cfg.tlsHttpRedirect) {
                install(HttpsRedirect) {
                    sslPort = httpsPort
                    permanentRedirect = false
                }
            }

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
                        call.respond(
                            HttpStatusCode.Unauthorized,
                            ErrorResponse("Unauthorized — provide a valid Bearer token")
                        )
                    }
                }
            }

            // Always install; when disabled limits are set to Long.MAX_VALUE (effectively unlimited).
            install(RateLimit) {
                val authLimit = if (cfg.rateLimitEnabled) cfg.rateLimitAuthRequestsPerMin else Int.MAX_VALUE
                val apiLimit = if (cfg.rateLimitEnabled) cfg.rateLimitApiRequestsPerMin else Int.MAX_VALUE
                val execLimit = if (cfg.rateLimitEnabled) cfg.rateLimitExecuteRequestsPerMin else Int.MAX_VALUE

                // Auth endpoints: IP-keyed, blocks brute-force on the challenge/poll flow
                register(RateLimitName("auth")) {
                    rateLimiter(limit = authLimit, refillPeriod = 1.minutes)
                    requestKey { call -> call.request.origin.remoteAddress }
                }
                // General API: IP-keyed (rate check runs before auth, principal not yet available)
                register(RateLimitName("api")) {
                    rateLimiter(limit = apiLimit, refillPeriod = 1.minutes)
                    requestKey { call -> call.request.origin.remoteAddress }
                }
                // Console command dispatch: tighter limit within the api budget, IP-keyed
                register(RateLimitName("execute")) {
                    rateLimiter(limit = execLimit, refillPeriod = 1.minutes)
                    requestKey { call -> call.request.origin.remoteAddress }
                }
            }

            install(StatusPages) {
                exception<Throwable> { call, cause ->
                    plugin.messages.console("web.error", "error" to (cause.message ?: "unknown"))
                    call.respond(
                        HttpStatusCode.InternalServerError,
                        ErrorResponse(cause.message ?: "Internal error")
                    )
                }
            }

            // Capture plugin classloader here — environment.classLoader may differ in Paper's plugin isolation
            val cl = plugin.javaClass.classLoader

            routing {
                get("/") {
                    val bytes = cl.getResourceAsStream("webroot/index.html")?.readBytes()
                        ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                    call.respondBytes(bytes, ContentType.Text.Html)
                }
                get("/favicon.svg") {
                    val bytes = cl.getResourceAsStream("webroot/favicon.svg")?.readBytes() ?: return@get
                    call.respondBytes(bytes, ContentType.Image.SVG)
                }
                get("/icons.svg") {
                    val bytes = cl.getResourceAsStream("webroot/icons.svg")?.readBytes() ?: return@get
                    call.respondBytes(bytes, ContentType.Image.SVG)
                }
                get("/assets/{file...}") {
                    val file = call.parameters.getAll("file")?.joinToString("/") ?: return@get
                    val bytes = cl.getResourceAsStream("webroot/assets/$file")?.readBytes()
                        ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                    call.respondBytes(bytes, when {
                        file.endsWith(".js") || file.endsWith(".mjs") -> ContentType.Application.JavaScript
                        file.endsWith(".css") -> ContentType.Text.CSS
                        file.endsWith(".svg") -> ContentType.Image.SVG
                        file.endsWith(".woff2") -> ContentType("font", "woff2")
                        file.endsWith(".woff")  -> ContentType("font", "woff")
                        else -> ContentType.Application.OctetStream
                    })
                }
                // SPA fallback — must be after all asset routes
                get("{...}") {
                    val bytes = cl.getResourceAsStream("webroot/index.html")?.readBytes()
                        ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                    call.respondBytes(bytes, ContentType.Text.Html)
                }

                rateLimit(RateLimitName("auth")) {
                    route("/api/auth") { authRoutes(plugin) }
                }

                rateLimit(RateLimitName("api")) {
                    authenticate("auth-jwt") {
                        route("/api") {
                            apiRoutes(plugin)
                            route("/files")   { fileRoutes(plugin) }
                            route("/glance")  { glanceRoutes(plugin) }
                            route("/actions") { actionRoutes(plugin) }
                            route("/stats")   { statsRoutes(plugin) }
                            route("/network") { networkRoutes(plugin) }
                            route("/system")  { systemRoutes(plugin) }
                            auditRoutes(plugin)
                        }
                    }
                }

                rateLimit(RateLimitName("auth")) {
                    webSocket("/ws/console") {
                        consoleWebSocket(plugin)
                    }
                }
            }
        }.start(wait = false)
    }

    fun stop() {
        server?.stop(1000, 5000)
        server = null
    }
}
