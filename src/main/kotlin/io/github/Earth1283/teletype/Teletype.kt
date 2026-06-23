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
import io.github.Earth1283.teletype.multiplex.PortMultiplexer
import io.github.Earth1283.teletype.web.WebServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
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
    lateinit var webServer: WebServer
    private var portMultiplexer: PortMultiplexer? = null

    internal val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onEnable() {
        saveDefaultConfig()
        ConfigUpdater.update(this, "config.yml")
        reloadConfig()
        teletypeConfig = TeletypeConfig(this)
        messages = MessageConfig(this).also { it.load() }
        challengeStore = ChallengeStore(this)
        jwtService = JwtService(teletypeConfig.jwtSecret)
        consoleBroadcaster = ConsoleBroadcaster(pluginScope)
        metricsDatabase = MetricsDatabase(dataFolder)
        metricsCollector = MetricsCollector(this, metricsDatabase, pluginScope)
        RetentionJob(this, metricsDatabase, pluginScope).start()
        snippetStore = SnippetStore(this).also { it.load() }
        snippetScheduler = SnippetScheduler(this, snippetStore).also { it.load(); it.startAll() }
        auditLog = AuditLog(dataFolder)
        ConsoleInterceptor.install(consoleBroadcaster)
        server.pluginManager.registerEvents(PlayerEventListener(metricsDatabase, pluginScope), this)
        webServer = WebServer(this).also { it.start() }
        if (teletypeConfig.multiplexGamePort) {
            portMultiplexer = PortMultiplexer(this).also { it.install() }
        }
        getCommand("tty")?.setExecutor(TtyCommand(this))

        val url = if (teletypeConfig.tlsEnabled) "https://localhost:${teletypeConfig.tlsHttpsPort}"
                  else "http://localhost:${teletypeConfig.port}"
        messages.console("startup", "version" to description.version, "url" to url)
    }

    override fun onDisable() {
        portMultiplexer?.uninstall()
        snippetScheduler.stopAll()
        webServer.stop()
        ConsoleInterceptor.uninstall()
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
}
