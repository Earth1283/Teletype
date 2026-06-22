package io.github.Earth1283.teletype.command

import io.github.Earth1283.teletype.Teletype
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.ConsoleCommandSender
import org.bukkit.command.TabCompleter
import java.util.UUID

class TtyCommand(private val plugin: Teletype) : CommandExecutor, TabCompleter {

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
            else     -> plugin.messages.send(sender, "command.unknown-subcommand")
        }
        return true
    }

    private fun handleVerify(sender: CommandSender, args: Array<String>) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            plugin.messages.send(sender, "command.verify.no-permission")
            return
        }
        if (args.size < 2) {
            plugin.messages.send(sender, "command.verify.usage")
            return
        }
        val uuid = runCatching { UUID.fromString(args[1]) }.getOrNull()
            ?: run { plugin.messages.send(sender, "command.verify.invalid-uuid"); return }

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
        plugin.webServer.start()
        plugin.messages.send(sender, "command.start.success")
    }

    private fun handleStop(sender: CommandSender) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            plugin.messages.send(sender, "command.no-permission"); return
        }
        if (!plugin.webServer.isRunning) {
            plugin.messages.send(sender, "command.stop.not-running"); return
        }
        plugin.webServer.stop()
        plugin.messages.send(sender, "command.stop.success")
    }

    override fun onTabComplete(
        sender: CommandSender, command: Command, alias: String, args: Array<String>
    ): List<String> {
        if (args.size == 1) return listOf("verify", "status", "start", "stop").filter {
            it.startsWith(args[0].lowercase())
        }
        return emptyList()
    }
}
