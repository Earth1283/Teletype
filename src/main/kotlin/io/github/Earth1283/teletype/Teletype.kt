package io.github.Earth1283.teletype

import io.github.Earth1283.teletype.actions.SnippetScheduler
import io.github.Earth1283.teletype.actions.SnippetStore
import io.github.Earth1283.teletype.audit.AuditEntry
import io.github.Earth1283.teletype.audit.AuditLog
import io.github.Earth1283.teletype.auth.ChallengeStore
import io.github.Earth1283.teletype.auth.JwtService
import io.github.Earth1283.teletype.command.TtyCommand
import io.github.Earth1283.teletype.config.ConfigUpdater
import io.github.Earth1283.teletype.config.MessageConfig
import io.github.Earth1283.teletype.config.TeletypeConfig
import io.github.Earth1283.teletype.console.ConsoleBroadcaster
import io.github.Earth1283.teletype.console.ConsoleInterceptor
import io.github.Earth1283.teletype.events.PlayerEventListener
import io.github.Earth1283.teletype.metrics.MetricsCollector
import io.github.Earth1283.teletype.metrics.MetricsDatabase
import io.github.Earth1283.teletype.metrics.RetentionJob
import io.github.Earth1283.teletype.multiplex.PortForwardManager
import io.github.Earth1283.teletype.multiplex.PortForwardStore
import io.github.Earth1283.teletype.multiplex.PortMultiplexer
import io.github.Earth1283.teletype.multiplex.RouteStore
import io.github.Earth1283.teletype.web.WebServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.TextComponent
import net.kyori.adventure.text.format.NamedTextColor
import net.kyori.adventure.text.format.TextDecoration
import org.bukkit.plugin.java.JavaPlugin

class Teletype : JavaPlugin() {
    lateinit var teletypeConfig: TeletypeConfig
    lateinit var messages: MessageConfig
    lateinit var challengeStore: ChallengeStore
    lateinit var jwtService: JwtService
    lateinit var consoleBroadcaster: ConsoleBroadcaster
    lateinit var metricsDatabase: MetricsDatabase
    lateinit var metricsCollector: MetricsCollector
    lateinit var snippetStore: SnippetStore
    lateinit var snippetScheduler: SnippetScheduler
    lateinit var auditLog: AuditLog
    lateinit var routeStore: RouteStore
    lateinit var portForwardStore: PortForwardStore
    lateinit var portForwardManager: PortForwardManager
    lateinit var webServer: WebServer
    private var portMultiplexer: PortMultiplexer? = null

    internal val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onEnable() {
        startupHeader()
        startupLine("CONFIG", "Preparing configuration files", dataFolder.absolutePath)
        saveDefaultConfig()
        ConfigUpdater.update(this, "config.yml")
        reloadConfig()
        teletypeConfig = TeletypeConfig(this)
        messages = MessageConfig(this).also { it.load() }
        startupLine("CONFIG", "Configuration loaded", "web=${bindSummary()}, tls=${enabled(teletypeConfig.tlsEnabled)}")

        challengeStore = ChallengeStore(this)
        jwtService = JwtService(teletypeConfig.jwtSecret)
        startupLine("AUTH", "JWT service initialized", "expiry=${teletypeConfig.jwtExpiryMinutes}m, require-op=${enabled(teletypeConfig.requireOp)}")

        consoleBroadcaster = ConsoleBroadcaster(
            pluginScope,
            teletypeConfig.consoleReplayBufferLines,
            teletypeConfig.consoleMaxLineLength
        )
        startupLine(
            "CONSOLE",
            "Console stream prepared",
            "enabled=${enabled(teletypeConfig.consoleEnabled)}, replay=${teletypeConfig.consoleReplayBufferLines}, max-line=${teletypeConfig.consoleMaxLineLength}"
        )

        metricsDatabase = MetricsDatabase(dataFolder)
        metricsCollector = MetricsCollector(this, metricsDatabase, pluginScope)
        RetentionJob(this, metricsDatabase, pluginScope).start()
        startupLine(
            "METRICS",
            "Metrics services initialized",
            "sqlite=${enabled(teletypeConfig.metricsSqliteEnabled)}, retention=${enabled(teletypeConfig.retentionEnabled)}, interval=${teletypeConfig.metricsSampleIntervalTicks}t"
        )

        snippetStore = SnippetStore(this).also { it.load() }
        snippetScheduler = SnippetScheduler(this, snippetStore).also { it.load(); it.startAll() }
        startupLine(
            "ACTIONS",
            "Action store loaded",
            "snippets=${snippetStore.getSnippets().size}, categories=${snippetStore.getCategories().size}, scheduled=${snippetScheduler.getActions().size}"
        )

        auditLog = AuditLog(dataFolder)
        routeStore = RouteStore(dataFolder).also { it.load() }
        portForwardStore = PortForwardStore(dataFolder).also { it.load() }
        portForwardManager = PortForwardManager(this).also { it.start(portForwardStore.getForwards()) }
        startupLine(
            "NETWORK",
            "Network routing loaded",
            "routes=${routeStore.getRoutes().size}, forwards=${portForwardStore.getForwards().size}, " +
                "multiplex=${enabled(teletypeConfig.multiplexGamePort)}, player-ip-forwarding=${enabled(teletypeConfig.forwardMinecraftPlayerAddresses)}"
        )

        if (teletypeConfig.consoleEnabled) ConsoleInterceptor.install(consoleBroadcaster)
        server.pluginManager.registerEvents(PlayerEventListener(metricsDatabase, pluginScope), this)
        startupLine("EVENTS", "Runtime hooks registered", "console-capture=${enabled(teletypeConfig.consoleEnabled)}, player-listener=on")
        webServer = WebServer(this).also { it.start() }
        startupLine("WEB", "Embedded web server started", bindSummary())
        if (!teletypeConfig.tlsEnabled) {
            startupLine(
                "SECURITY",
                "HTTP is not encrypted",
                "anyone on the network path can read or alter Teletype traffic"
            )
        }
        if (teletypeConfig.trustProxyHeaders) {
            startupLine(
                "PROXY",
                "Trusting reverse-proxy headers",
                "make sure direct access to the Teletype port is blocked"
            )
        }
        if (teletypeConfig.multiplexGamePort) {
            portMultiplexer = PortMultiplexer(this).also { it.install() }
            startupLine("MUX", "Game-port multiplexer installed", "public-port=${teletypeConfig.multiplexPort}")
        }
        getCommand("tty")?.also {
            val ttyCommand = TtyCommand(this)
            it.setExecutor(ttyCommand)
            it.tabCompleter = ttyCommand
        }
        startupLine("COMMAND", "Registered /tty command", "aliases=/teletype, /teletypewriter")

        val url = if (teletypeConfig.tlsEnabled) "https://localhost:${teletypeConfig.tlsHttpsPort}"
                  else "http://localhost:${teletypeConfig.port}"
        messages.console("startup", "version" to pluginMeta.version, "url" to url)
    }

    override fun onDisable() {
        portForwardManager.shutdown()
        portMultiplexer?.uninstall()
        snippetScheduler.stopAll()
        webServer.stop()
        ConsoleInterceptor.uninstall()
        metricsCollector.close()
        pluginScope.cancel()
        metricsDatabase.close()
        auditLog.close()
        messages.console("shutdown")
    }

    fun auditAsync(action: String, detail: String, actor: String, ip: String) {
        pluginScope.launch(Dispatchers.IO) {
            runCatching {
                auditLog.insert(AuditEntry(
                    ts     = System.currentTimeMillis(),
                    actor  = actor,
                    ip     = ip,
                    action = action,
                    detail = detail,
                ))
            }
        }
    }

    private fun startupHeader() {
        server.consoleSender.sendMessage(
            Component.text()
                .append(startupPrefix())
                .append(Component.text("Starting v${pluginMeta.version}", NamedTextColor.WHITE))
                .build()
        )
    }

    private fun startupLine(stage: String, message: String, detail: String? = null) {
        val line = Component.text()
            .append(startupPrefix())
            .append(Component.text(stage.padEnd(7), NamedTextColor.DARK_AQUA, TextDecoration.BOLD))
            .append(Component.text(" ", NamedTextColor.GRAY))
            .append(Component.text(message, NamedTextColor.WHITE))

        if (!detail.isNullOrBlank()) {
            line.append(Component.text(" - ", NamedTextColor.DARK_GRAY))
                .append(Component.text(detail, NamedTextColor.GRAY))
        }

        server.consoleSender.sendMessage(line.build())
    }

    private fun startupPrefix(): TextComponent =
        Component.text()
            .append(Component.text("[", NamedTextColor.DARK_GRAY))
            .append(Component.text("Teletype", NamedTextColor.AQUA, TextDecoration.BOLD))
            .append(Component.text("] ", NamedTextColor.DARK_GRAY))
            .build()

    private fun bindSummary(): String =
        if (teletypeConfig.tlsEnabled) {
            "http=:${teletypeConfig.port}, https=:${teletypeConfig.tlsHttpsPort}, redirect=${enabled(teletypeConfig.tlsHttpRedirect)}"
        } else {
            "http=:${teletypeConfig.port}"
        }

    private fun enabled(value: Boolean): String = if (value) "on" else "off"
}
