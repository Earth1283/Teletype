package io.github.Earth1283.teletype.config

import io.github.Earth1283.teletype.Teletype
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.minimessage.MiniMessage
import org.bukkit.command.CommandSender
import org.bukkit.configuration.file.YamlConfiguration
import java.io.File

class MessageConfig(private val plugin: Teletype) {
    private val mm = MiniMessage.miniMessage()
    private lateinit var cfg: YamlConfiguration

    fun load() {
        plugin.saveResource("messages.yml", false)
        cfg = YamlConfiguration.loadConfiguration(File(plugin.dataFolder, "messages.yml"))
    }

    /**
     * Returns a parsed Component for the given dot-notation key.
     * Substitutes {prefix} automatically, then each supplied placeholder.
     * Placeholder values are tag-escaped so user-provided strings can't inject formatting.
     */
    fun get(key: String, vararg placeholders: Pair<String, String>): Component {
        val prefix = cfg.getString("prefix") ?: "<bold><aqua>Teletype</aqua></bold> <dark_gray>»</dark_gray> "
        var raw = cfg.getString(key)
        if (raw == null) {
            plugin.logger.warning("Missing messages.yml key: $key")
            return mm.deserialize("<red>[missing: $key]</red>")
        }
        if (raw.isBlank()) return Component.empty()
        raw = raw.replace("{prefix}", prefix)
        placeholders.forEach { (k, v) -> raw = raw!!.replace("{$k}", mm.escapeTags(v)) }
        return mm.deserialize(raw!!)
    }

    /** Sends a message to the console sender. */
    fun console(key: String, vararg placeholders: Pair<String, String>) {
        val component = get(key, *placeholders)
        if (component != Component.empty()) plugin.server.consoleSender.sendMessage(component)
    }

    /** Sends a message to a CommandSender. */
    fun send(sender: CommandSender, key: String, vararg placeholders: Pair<String, String>) {
        val component = get(key, *placeholders)
        if (component != Component.empty()) sender.sendMessage(component)
    }
}
