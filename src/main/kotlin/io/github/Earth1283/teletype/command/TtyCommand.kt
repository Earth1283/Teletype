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
            sender.sendMessage("§eUsage: /tty <verify|status|start|stop>")
            return true
        }
        when (args[0].lowercase()) {
            "verify" -> handleVerify(sender, args)
            "status" -> handleStatus(sender)
            "start"  -> handleStart(sender)
            "stop"   -> handleStop(sender)
            else     -> sender.sendMessage("§cUnknown subcommand. Usage: /tty <verify|status|start|stop>")
        }
        return true
    }

    private fun handleVerify(sender: CommandSender, args: Array<String>) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            sender.sendMessage("§cOnly operators or console can verify challenges.")
            return
        }
        if (args.size < 2) {
            sender.sendMessage("§cUsage: /tty verify <uuid>")
            return
        }
        val uuid = runCatching { UUID.fromString(args[1]) }.getOrNull()
            ?: run { sender.sendMessage("§cInvalid UUID format."); return }

        val jwt = plugin.jwtService.issueToken(expiryHours = plugin.teletypeConfig.jwtExpiryHours)
        if (plugin.challengeStore.verify(uuid, jwt)) {
            sender.sendMessage("§aChallenge verified. JWT issued to the waiting client.")
        } else {
            sender.sendMessage("§cChallenge not found or already expired.")
        }
    }

    private fun handleStatus(sender: CommandSender) {
        if (plugin.webServer.isRunning) {
            sender.sendMessage("§aTeletype web server is running on port ${plugin.teletypeConfig.port}")
        } else {
            sender.sendMessage("§cTeletype web server is stopped.")
        }
    }

    private fun handleStart(sender: CommandSender) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            sender.sendMessage("§cNo permission."); return
        }
        if (plugin.webServer.isRunning) {
            sender.sendMessage("§eWeb server is already running."); return
        }
        plugin.webServer.start()
        sender.sendMessage("§aWeb server started.")
    }

    private fun handleStop(sender: CommandSender) {
        if (!sender.isOp && sender !is ConsoleCommandSender) {
            sender.sendMessage("§cNo permission."); return
        }
        if (!plugin.webServer.isRunning) {
            sender.sendMessage("§eWeb server is not running."); return
        }
        plugin.webServer.stop()
        sender.sendMessage("§cWeb server stopped.")
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
