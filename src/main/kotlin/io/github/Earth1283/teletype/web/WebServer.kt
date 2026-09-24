package io.github.Earth1283.teletype.web

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.multiplex.PortMultiplexer
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.routing.ApiException
import io.github.Earth1283.teletype.web.routing.LAST_MODIFIED_HEADER
import io.github.Earth1283.teletype.web.routing.actionRoutes
import io.github.Earth1283.teletype.web.routing.apiRoutes
import io.github.Earth1283.teletype.web.routing.auditRoutes
import io.github.Earth1283.teletype.web.routing.authRoutes
import io.github.Earth1283.teletype.web.routing.consoleWebSocket
import io.github.Earth1283.teletype.web.routing.fileRoutes
import io.github.Earth1283.teletype.web.routing.glanceRoutes
import io.github.Earth1283.teletype.web.routing.networkRoutes
import io.github.Earth1283.teletype.web.routing.notFound
import io.github.Earth1283.teletype.web.routing.profilingRoutes
import io.github.Earth1283.teletype.web.routing.statsRoutes
import io.github.Earth1283.teletype.web.routing.systemRoutes
import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.createApplicationPlugin
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
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.compression.Compression
import io.ktor.server.plugins.compression.gzip
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.forwardedheaders.ForwardedHeaders
import io.ktor.server.plugins.forwardedheaders.XForwardedHeaders
import io.ktor.server.plugins.httpsredirect.HttpsRedirect
import io.ktor.server.plugins.mutableOriginConnectionPoint
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimit
import io.ktor.server.plugins.ratelimit.RateLimitName
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondFile
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.logging.Level
import kotlin.time.Duration.Companion.minutes

private const val MAX_REMEMBERED_MISSING_ASSETS = 256

class WebServer(private val plugin: Teletype) {
    private var server: EmbeddedServer<NettyApplicationEngine, NettyApplicationEngine.Configuration>? = null
    private val staticCache = ConcurrentHashMap<String, ByteArray>()
    private val missingStatic = ConcurrentHashMap.newKeySet<String>()
    val downloadTokens = DownloadTokens()

    val isRunning: Boolean get() = server != null

    fun start() {
        val cfg = plugin.teletypeConfig
        val tls = if (cfg.tlsEnabled) TlsManager(plugin).load() else null

        server = embeddedServer(Netty, configure = {
            connector { port = cfg.port }
            if (tls != null) {
                sslConnector(
                    keyStore = tls.keyStore,
                    keyAlias = tls.alias,
                    keyStorePassword = { tls.storePassword.toCharArray() },
                    privateKeyPassword = { tls.keyPassword.toCharArray() }
                ) {
                    port = cfg.tlsHttpsPort
                }
            }
        }) {
            installPlugins()
            routing {
                staticRoutes()
                downloadRoute()

                rateLimit(RateLimitName("auth")) {
                    route("/api/auth") { authRoutes(plugin) }
                }

                rateLimit(RateLimitName("api")) {
                    authenticate("auth-jwt") {
                        route("/api") {
                            apiRoutes(plugin)
                            route("/files")     { fileRoutes(plugin) }
                            route("/glance")    { glanceRoutes(plugin) }
                            route("/actions")   { actionRoutes(plugin) }
                            route("/stats")     { statsRoutes(plugin) }
                            route("/network")   { networkRoutes(plugin) }
                            route("/system")    { systemRoutes(plugin) }
                            route("/profiling") { profilingRoutes(plugin) }
                            auditRoutes(plugin)
                        }
                    }
                }

                rateLimit(RateLimitName("ws")) {
                    webSocket("/ws/console") { consoleWebSocket(plugin) }
                }
            }
        }.start(wait = false)
    }

    fun stop() {
        server?.stop(1000, 5000)
        server = null
        downloadTokens.clear()
    }

    private fun Application.installPlugins() {
        val cfg = plugin.teletypeConfig

        if (cfg.trustProxyHeaders) {
            install(ForwardedHeaders)
            install(XForwardedHeaders)
        }
        if (cfg.multiplexGamePort) install(MultiplexerClientAddress)

        if (cfg.tlsEnabled && cfg.tlsHttpRedirect) {
            install(HttpsRedirect) {
                sslPort = cfg.tlsHttpsPort
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

        install(Compression) { gzip() }

        install(CORS) {
            if (cfg.corsOrigins.isEmpty()) anyHost() else cfg.corsOrigins.forEach { allowOrigin(it) }
            allowHeader(HttpHeaders.Authorization)
            allowHeader(HttpHeaders.ContentType)
            exposeHeader(LAST_MODIFIED_HEADER)
            allowMethod(HttpMethod.Options)
            allowMethod(HttpMethod.Put)
            allowMethod(HttpMethod.Delete)
            allowMethod(HttpMethod.Patch)
        }

        install(Authentication) {
            jwt("auth-jwt") {
                realm = "Teletype"
                verifier { plugin.jwtService.verifier }
                validate { credential -> JWTPrincipal(credential.payload) }
                challenge { _, _ ->
                    call.respond(HttpStatusCode.Unauthorized, ErrorResponse("Unauthorized — provide a valid Bearer token"))
                }
            }
        }

        install(RateLimit) {
            fun limit(configured: Int) = if (cfg.rateLimitEnabled) configured else Int.MAX_VALUE
            listOf(
                "auth" to limit(cfg.rateLimitAuthRequestsPerMin),
                "api" to limit(cfg.rateLimitApiRequestsPerMin),
                "execute" to limit(cfg.rateLimitExecuteRequestsPerMin),
                "ws" to limit(20),
            ).forEach { (name, perMinute) ->
                register(RateLimitName(name)) {
                    rateLimiter(limit = perMinute, refillPeriod = 1.minutes)
                    requestKey { call -> call.request.origin.remoteAddress }
                }
            }
        }

        install(StatusPages) {
            exception<ApiException> { call, cause ->
                call.respond(cause.status, ErrorResponse(cause.message))
            }
            exception<BadRequestException> { call, cause ->
                call.respond(HttpStatusCode.BadRequest, ErrorResponse(cause.cause?.message ?: cause.message ?: "Bad request"))
            }
            exception<Throwable> { call, cause ->
                plugin.logger.log(Level.SEVERE, "Unhandled error on ${call.request.httpMethod.value} ${call.request.path()}", cause)
                call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Internal server error — see the server console for details"))
            }
        }
    }

    private fun io.ktor.server.plugins.cors.CORSConfig.allowOrigin(origin: String) {
        runCatching {
            val uri = java.net.URI(origin)
            val authority = if (uri.port != -1) "${uri.host}:${uri.port}" else uri.host
            if (authority != null) allowHost(authority, schemes = listOf(uri.scheme ?: "https"))
        }
    }

    private fun Route.staticRoutes() {
        get("/") { respondIndex() }
        get("/favicon.svg") { respondStatic("webroot/favicon.svg", ContentType.Image.SVG, "public, max-age=3600") }
        get("/icons.svg") { respondStatic("webroot/icons.svg", ContentType.Image.SVG, "public, max-age=3600") }
        get("/assets/{file...}") {
            val file = call.parameters.getAll("file")?.joinToString("/") ?: return@get
            respondStatic("webroot/assets/$file", assetContentType(file), "public, max-age=31536000, immutable")
        }
        get("{...}") {
            if (call.request.path().startsWith("/api/")) notFound("Unknown API endpoint")
            respondIndex()
        }
    }

    private suspend fun io.ktor.server.routing.RoutingContext.respondIndex() =
        respondStatic("webroot/index.html", ContentType.Text.Html, "no-cache")

    private suspend fun io.ktor.server.routing.RoutingContext.respondStatic(path: String, type: ContentType, cacheControl: String) {
        val bytes = staticBytes(path) ?: return call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
        call.response.header(HttpHeaders.CacheControl, cacheControl)
        call.respondBytes(bytes, type)
    }

    private fun assetContentType(file: String): ContentType = when (file.substringAfterLast('.')) {
        "js", "mjs" -> ContentType.Application.JavaScript
        "css" -> ContentType.Text.CSS
        "svg" -> ContentType.Image.SVG
        "woff2" -> ContentType("font", "woff2")
        "woff" -> ContentType("font", "woff")
        "ttf" -> ContentType("font", "ttf")
        else -> ContentType.Application.OctetStream
    }

    private fun Route.downloadRoute() {
        rateLimit(RateLimitName("api")) {
            get("/api/download/{token}") {
                val ticket = call.parameters["token"]?.let(downloadTokens::redeemOnce)
                    ?.takeIf { it.file.isFile }
                    ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Download link expired or invalid"))
                call.response.header(
                    HttpHeaders.ContentDisposition,
                    ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, ticket.downloadName).toString()
                )
                call.respondFile(ticket.file)
            }
        }
    }

    private suspend fun staticBytes(path: String): ByteArray? {
        staticCache[path]?.let { return it }
        if (path in missingStatic) return null

        return withContext(Dispatchers.IO) {
            val bytes = plugin.javaClass.classLoader.getResourceAsStream(path)?.use { it.readBytes() }
            when {
                bytes != null -> staticCache[path] = bytes
                missingStatic.size < MAX_REMEMBERED_MISSING_ASSETS -> missingStatic += path
            }
            bytes
        }
    }
}

private val MultiplexerClientAddress = createApplicationPlugin("MultiplexerClientAddress") {
    onCall { call ->
        val clientAddress = call.request.headers[PortMultiplexer.CLIENT_ADDRESS_HEADER] ?: return@onCall
        val peer = call.request.local.remoteAddress
        if (runCatching { InetAddress.getByName(peer).isLoopbackAddress }.getOrDefault(false)) {
            call.mutableOriginConnectionPoint.remoteAddress = clientAddress
            call.mutableOriginConnectionPoint.remoteHost = clientAddress
        }
    }
}
