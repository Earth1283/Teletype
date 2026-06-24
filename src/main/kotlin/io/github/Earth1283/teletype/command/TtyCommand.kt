package io.github.Earth1283.teletype.command

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.auth.JwtService
import io.github.Earth1283.teletype.config.ConfigUpdater
import io.github.Earth1283.teletype.config.TeletypeConfig
import io.github.Earth1283.teletype.util.TeletypeCommandOrigin
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.TextComponent
import net.kyori.adventure.text.format.NamedTextColor
import net.kyori.adventure.text.format.TextDecoration
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.ConsoleCommandSender
import org.bukkit.command.TabCompleter
import org.bukkit.entity.Player
import java.io.File
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.util.UUID

class TtyCommand(private val plugin: Teletype) : CommandExecutor, TabCompleter {
    private data class DoctorCheck(val level: Level, val name: String, val detail: String)
    private enum class Level { PASS, WARN, FAIL }

    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<String>): Boolean {
        if (args.isEmpty()) {
            plugin.messages.send(sender, "command.usage")
            return true
        }
        when (args[0].lowercase()) {
            "verify" -> handleVerify(sender, args)
            "status" -> handleStatus(sender)
            "start"  -> handleStart(sender)
            "stop"   -> handleStop(sender)
            "reload" -> handleReload(sender)
            "doctor" -> handleDoctor(sender)
            else     -> plugin.messages.send(sender, "command.unknown-subcommand")
        }
        return true
    }

    private fun handleVerify(sender: CommandSender, args: Array<String>) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            plugin.messages.send(sender, "command.verify.no-permission")
            return
        }
        if (plugin.teletypeConfig.disallowTeletypeVerify && TeletypeCommandOrigin.isActive) {
            plugin.messages.send(sender, "command.verify.teletype-denied")
            return
        }
        if (args.size < 2) {
            plugin.messages.send(sender, "command.verify.usage")
            return
        }
        val uuid = runCatching { UUID.fromString(args[1]) }.getOrNull()
            ?: run { plugin.messages.send(sender, "command.verify.invalid-uuid"); return }

        val challenge = plugin.challengeStore.getPending(uuid)
            ?: run { plugin.messages.send(sender, "command.verify.not-found"); return }

        if (sender is Player && plugin.teletypeConfig.disallowPlayerVerify) {
            val playerIp = normalizeIp(sender.address?.address?.hostAddress)
            val challengeIp = normalizeIp(challenge.remoteAddress)
            val matchingIpAllowed = plugin.teletypeConfig.allowPlayerVerifyMatchingIp &&
                playerIp != null &&
                challengeIp != null &&
                playerIp == challengeIp

            if (!matchingIpAllowed) {
                val messageKey = if (plugin.teletypeConfig.allowPlayerVerifyMatchingIp) {
                    "command.verify.player-ip-mismatch"
                } else {
                    "command.verify.player-denied"
                }
                plugin.messages.send(
                    sender,
                    messageKey,
                    "player_ip" to (playerIp ?: "unknown"),
                    "http_ip" to (challengeIp ?: "unknown")
                )
                return
            }
        }

        val jwt = plugin.jwtService.issueToken(expiryHours = plugin.teletypeConfig.jwtExpiryHours)
        if (plugin.challengeStore.verify(uuid, jwt)) {
            plugin.messages.send(sender, "command.verify.success")
        } else {
            plugin.messages.send(sender, "command.verify.not-found")
        }
    }

    private fun handleStatus(sender: CommandSender) {
        if (plugin.webServer.isRunning) {
            plugin.messages.send(sender, "command.status.running", "port" to plugin.teletypeConfig.port.toString())
        } else {
            plugin.messages.send(sender, "command.status.stopped")
        }
    }

    private fun handleStart(sender: CommandSender) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            plugin.messages.send(sender, "command.no-permission"); return
        }
        if (plugin.webServer.isRunning) {
            plugin.messages.send(sender, "command.start.already-running"); return
        }
        plugin.messages.send(sender, "command.start.progress")
        runCatching {
            plugin.webServer.start()
        }.onSuccess {
            plugin.messages.send(sender, "command.start.success")
        }.onFailure { e ->
            plugin.messages.send(sender, "command.start.failed", "error" to (e.message ?: "unknown"))
        }
    }

    private fun handleStop(sender: CommandSender) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            plugin.messages.send(sender, "command.no-permission"); return
        }
        if (!plugin.webServer.isRunning) {
            plugin.messages.send(sender, "command.stop.not-running"); return
        }
        plugin.messages.send(sender, "command.stop.progress")
        runCatching {
            plugin.webServer.stop()
        }.onSuccess {
            plugin.messages.send(sender, "command.stop.success")
        }.onFailure { e ->
            plugin.messages.send(sender, "command.stop.failed", "error" to (e.message ?: "unknown"))
        }
    }

    private fun handleReload(sender: CommandSender) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            plugin.messages.send(sender, "command.no-permission"); return
        }

        val wasRunning = plugin.webServer.isRunning
        plugin.messages.send(sender, "command.reload.progress")
        runCatching {
            if (wasRunning) plugin.webServer.stop()
            ConfigUpdater.update(plugin, "config.yml")
            plugin.reloadConfig()
            plugin.teletypeConfig = TeletypeConfig(plugin)
            plugin.messages.load()
            plugin.jwtService = JwtService(plugin.teletypeConfig.jwtSecret)
            if (wasRunning) plugin.webServer.start()
        }.onSuccess {
            val state = if (wasRunning) "web server restarted" else "web server left stopped"
            plugin.messages.send(sender, "command.reload.success", "state" to state)
        }.onFailure { e ->
            plugin.messages.send(sender, "command.reload.failed", "error" to (e.message ?: "unknown"))
        }
    }

    private fun handleDoctor(sender: CommandSender) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            plugin.messages.send(sender, "command.no-permission"); return
        }

        val checks = buildDoctorChecks()
        val failures = checks.count { it.level == Level.FAIL }
        val warnings = checks.count { it.level == Level.WARN }
        sender.sendMessage(
            Component.text()
                .append(prefix())
                .append(Component.text("Doctor report ", NamedTextColor.WHITE, TextDecoration.BOLD))
                .append(Component.text("($failures failed, $warnings warning${if (warnings == 1) "" else "s"})", NamedTextColor.GRAY))
                .build()
        )
        checks.forEach { sender.sendMessage(doctorLine(it)) }
    }

    private fun buildDoctorChecks(): List<DoctorCheck> {
        val cfg = plugin.teletypeConfig
        val dataFolder = plugin.dataFolder
        val configFile = File(dataFolder, "config.yml")
        val messagesFile = File(dataFolder, "messages.yml")
        val metricsDb = File(dataFolder, "teletype-metrics.db")
        val auditDb = File(dataFolder, "teletype-audit.db")

        return buildList {
            add(fileCheck("Data folder", dataFolder, expectDirectory = true, requireWrite = true))
            add(fileCheck("config.yml", configFile, expectDirectory = false, requireWrite = true))
            add(fileCheck("messages.yml", messagesFile, expectDirectory = false, requireWrite = true))
            add(
                if (plugin.javaClass.classLoader.getResource("webroot/index.html") != null) {
                    DoctorCheck(Level.PASS, "Web assets", "webroot/index.html is bundled")
                } else {
                    DoctorCheck(Level.FAIL, "Web assets", "webroot/index.html is missing from the plugin jar")
                }
            )
            add(
                if (plugin.webServer.isRunning) {
                    DoctorCheck(Level.PASS, "Web server", "running on http=:${cfg.port}${if (cfg.tlsEnabled) ", https=:${cfg.tlsHttpsPort}" else ""}")
                } else {
                    DoctorCheck(Level.WARN, "Web server", "stopped; /tty start will bind http=:${cfg.port}")
                }
            )
            add(portCheck("HTTP port", cfg.port, skipBind = plugin.webServer.isRunning))
            if (cfg.tlsEnabled) add(portCheck("HTTPS port", cfg.tlsHttpsPort, skipBind = plugin.webServer.isRunning))
            add(tlsCheck(cfg))
            add(
                if (cfg.trustProxyHeaders) {
                    DoctorCheck(Level.WARN, "Proxy headers", "trusted; direct access to :${cfg.port} must be blocked")
                } else {
                    DoctorCheck(Level.PASS, "Proxy headers", "not trusted")
                }
            )
            add(
                if (cfg.jwtSecret.length >= 32) {
                    DoctorCheck(Level.PASS, "Auth secret", "JWT secret is present (${cfg.jwtSecret.length} chars)")
                } else {
                    DoctorCheck(Level.FAIL, "Auth secret", "JWT secret is too short or missing")
                }
            )
            add(
                if (cfg.disallowTeletypeVerify) {
                    DoctorCheck(Level.PASS, "Verify guard", "Teletype-originated /tty verify is blocked")
                } else {
                    DoctorCheck(Level.WARN, "Verify guard", "Teletype-originated /tty verify is allowed")
                }
            )
            add(
                when {
                    !cfg.disallowPlayerVerify ->
                        DoctorCheck(Level.WARN, "Player verify", "operators can verify challenges in-game")
                    cfg.allowPlayerVerifyMatchingIp ->
                        DoctorCheck(Level.PASS, "Player verify", "blocked unless player IP matches challenge HTTP IP")
                    else ->
                        DoctorCheck(Level.PASS, "Player verify", "blocked for all players")
                }
            )
            add(fileCheck("Metrics DB", metricsDb, expectDirectory = false, requireWrite = true, missingLevel = if (cfg.metricsSqliteEnabled) Level.WARN else Level.PASS))
            add(fileCheck("Audit DB", auditDb, expectDirectory = false, requireWrite = true))
            add(fileCheck("Files root", cfg.filesRoot, expectDirectory = true, requireWrite = false, missingLevel = if (cfg.filesEnabled) Level.FAIL else Level.WARN))
            add(DoctorCheck(Level.PASS, "Actions", "${plugin.snippetStore.getSnippets().size} snippets, ${plugin.snippetScheduler.getActions().size} scheduled"))
            add(DoctorCheck(Level.PASS, "Network", "${plugin.routeStore.getRoutes().size} routes, ${plugin.portForwardStore.getForwards().size} forwards, multiplex=${if (cfg.multiplexGamePort) "on" else "off"}"))
            add(
                when {
                    !cfg.multiplexGamePort ->
                        DoctorCheck(Level.PASS, "Player IP forwarding", "multiplexer is disabled")
                    cfg.forwardMinecraftPlayerAddresses ->
                        DoctorCheck(Level.WARN, "Player IP forwarding", "enabled; Paper proxy-protocol must be enabled on the internal game listener")
                    else ->
                        DoctorCheck(Level.WARN, "Player IP forwarding", "disabled; Minecraft will see multiplexer connections as 127.0.0.1")
                }
            )
        }
    }

    private fun fileCheck(
        name: String,
        file: File,
        expectDirectory: Boolean,
        requireWrite: Boolean,
        missingLevel: Level = Level.FAIL,
    ): DoctorCheck {
        if (!file.exists()) return DoctorCheck(missingLevel, name, "missing: ${file.absolutePath}")
        if (expectDirectory && !file.isDirectory) return DoctorCheck(Level.FAIL, name, "not a directory: ${file.absolutePath}")
        if (!expectDirectory && !file.isFile) return DoctorCheck(Level.FAIL, name, "not a file: ${file.absolutePath}")
        if (!file.canRead()) return DoctorCheck(Level.FAIL, name, "not readable: ${file.absolutePath}")
        if (requireWrite && !file.canWrite()) return DoctorCheck(Level.FAIL, name, "not writable: ${file.absolutePath}")
        return DoctorCheck(Level.PASS, name, file.absolutePath)
    }

    private fun portCheck(name: String, port: Int, skipBind: Boolean): DoctorCheck {
        if (port !in 1..65535) return DoctorCheck(Level.FAIL, name, "invalid port $port")
        if (skipBind) return DoctorCheck(Level.PASS, name, ":$port already owned by running Teletype web server")
        return runCatching {
            ServerSocket().use { socket ->
                socket.reuseAddress = true
                socket.bind(InetSocketAddress("0.0.0.0", port))
            }
        }.fold(
            onSuccess = { DoctorCheck(Level.PASS, name, ":$port is available") },
            onFailure = { DoctorCheck(Level.FAIL, name, ":$port is not available (${it.message ?: "bind failed"})") }
        )
    }

    private fun tlsCheck(cfg: TeletypeConfig): DoctorCheck {
        if (!cfg.tlsEnabled) return DoctorCheck(Level.WARN, "TLS", "disabled; web UI is served over HTTP")
        if (cfg.tlsMode != "keystore") return DoctorCheck(Level.PASS, "TLS", "enabled with auto self-signed certificate")

        val file = File(cfg.tlsKeystorePath).let { if (it.isAbsolute) it else File(plugin.dataFolder, cfg.tlsKeystorePath) }
        return when {
            cfg.tlsKeystorePath.isBlank() -> DoctorCheck(Level.FAIL, "TLS", "server.tls.keystore-path is blank")
            !file.exists() -> DoctorCheck(Level.FAIL, "TLS", "keystore missing: ${file.absolutePath}")
            !file.canRead() -> DoctorCheck(Level.FAIL, "TLS", "keystore not readable: ${file.absolutePath}")
            cfg.tlsKeystorePassword.isBlank() -> DoctorCheck(Level.WARN, "TLS", "keystore password is blank")
            else -> DoctorCheck(Level.PASS, "TLS", "keystore readable: ${file.absolutePath}")
        }
    }

    private fun doctorLine(check: DoctorCheck): TextComponent {
        val color = when (check.level) {
            Level.PASS -> NamedTextColor.GREEN
            Level.WARN -> NamedTextColor.YELLOW
            Level.FAIL -> NamedTextColor.RED
        }
        return Component.text()
            .append(prefix())
            .append(Component.text(check.level.name.padEnd(4), color, TextDecoration.BOLD))
            .append(Component.text(" ${check.name}", NamedTextColor.WHITE))
            .append(Component.text(" - ", NamedTextColor.DARK_GRAY))
            .append(Component.text(check.detail, NamedTextColor.GRAY))
            .build()
    }

    private fun prefix(): TextComponent =
        Component.text()
            .append(Component.text("Teletype", NamedTextColor.AQUA, TextDecoration.BOLD))
            .append(Component.text(" » ", NamedTextColor.DARK_GRAY))
            .build()

    private fun normalizeIp(value: String?): String? {
        val trimmed = value?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return trimmed
            .removePrefix("/")
            .removePrefix("::ffff:")
            .substringBefore('%')
    }

    override fun onTabComplete(
        sender: CommandSender, command: Command, alias: String, args: Array<String>
    ): List<String> {
        if (args.size == 1) return listOf("verify", "status", "start", "stop", "reload", "doctor").filter {
            it.startsWith(args[0].lowercase())
        }
        return emptyList()
    }
}
