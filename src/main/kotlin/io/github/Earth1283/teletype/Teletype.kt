package io.github.Earth1283.teletype

import io.github.Earth1283.teletype.actions.SnippetScheduler
import io.github.Earth1283.teletype.actions.SnippetStore
import io.github.Earth1283.teletype.auth.ChallengeStore
import io.github.Earth1283.teletype.auth.JwtService
import io.github.Earth1283.teletype.command.TtyCommand
import io.github.Earth1283.teletype.config.TeletypeConfig
import io.github.Earth1283.teletype.console.ConsoleBroadcaster
import io.github.Earth1283.teletype.console.ConsoleInterceptor
import io.github.Earth1283.teletype.metrics.MetricsCollector
import io.github.Earth1283.teletype.metrics.MetricsDatabase
import io.github.Earth1283.teletype.metrics.RetentionJob
import io.github.Earth1283.teletype.web.WebServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.bukkit.plugin.java.JavaPlugin

class Teletype : JavaPlugin() {
    lateinit var teletypeConfig: TeletypeConfig
    lateinit var challengeStore: ChallengeStore
    lateinit var jwtService: JwtService
    lateinit var consoleBroadcaster: ConsoleBroadcaster
    lateinit var metricsDatabase: MetricsDatabase
    lateinit var metricsCollector: MetricsCollector
    lateinit var snippetStore: SnippetStore
    lateinit var snippetScheduler: SnippetScheduler
    lateinit var webServer: WebServer

    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onEnable() {
        saveDefaultConfig()
        teletypeConfig = TeletypeConfig(this)
        challengeStore = ChallengeStore(this)
        jwtService = JwtService(teletypeConfig.jwtSecret)
        consoleBroadcaster = ConsoleBroadcaster(pluginScope)
        metricsDatabase = MetricsDatabase(dataFolder)
        metricsCollector = MetricsCollector(this, metricsDatabase, pluginScope)
        RetentionJob(this, metricsDatabase, pluginScope).start()
        snippetStore = SnippetStore(this).also { it.load() }
        snippetScheduler = SnippetScheduler(this, snippetStore).also { it.load(); it.startAll() }
        ConsoleInterceptor.install(consoleBroadcaster)
        webServer = WebServer(this).also { it.start() }
        getCommand("tty")?.setExecutor(TtyCommand(this))
    }

    override fun onDisable() {
        snippetScheduler.stopAll()
        webServer.stop()
        ConsoleInterceptor.uninstall()
        pluginScope.cancel()
        metricsDatabase.close()
    }
}
