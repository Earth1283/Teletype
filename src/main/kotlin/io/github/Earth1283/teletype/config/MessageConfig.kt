package io.github.Earth1283.teletype.config

import io.github.Earth1283.teletype.Teletype
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.minimessage.MiniMessage
import org.bukkit.Bukkit
import org.bukkit.command.CommandSender
import org.bukkit.configuration.file.YamlConfiguration
import java.io.File

class MessageConfig(private val plugin: Teletype) {
    private val mm = MiniMessage.miniMessage()
    private lateinit var cfg: YamlConfiguration
    private lateinit var fallback: YamlConfiguration

    companion object {
        /** Languages bundled in the plugin jar, under the languages directory. */
        val BUNDLED_LANGUAGES = listOf("en", "es", "fr", "zh")
    }

    fun load() {
        for (code in BUNDLED_LANGUAGES) {
            val resourcePath = "languages/$code.yml"
            plugin.saveResource(resourcePath, false)
            ConfigUpdater.update(plugin, resourcePath)
        }

        fallback = YamlConfiguration.loadConfiguration(File(plugin.dataFolder, "languages/en.yml"))

        var language = plugin.teletypeConfig.language
        var languageFile = File(plugin.dataFolder, "languages/$language.yml")
        if (!languageFile.exists()) {
            plugin.logger.warning("Unknown language '$language' (no plugins/Teletype/languages/$language.yml). Falling back to English.")
            language = "en"
            languageFile = File(plugin.dataFolder, "languages/en.yml")
        }

        cfg = YamlConfiguration.loadConfiguration(languageFile)
    }

    /**
     * Returns a parsed Component for the given dot-notation key.
     * Substitutes {prefix} automatically, then each supplied placeholder.
     * Placeholder values are tag-escaped so user-provided strings can't inject formatting.
     */
    fun get(key: String, vararg placeholders: Pair<String, String>): Component {
        val prefix = cfg.getString("prefix") ?: fallback.getString("prefix")
            ?: "<bold><aqua>Teletype</aqua></bold> <dark_gray>»</dark_gray> "
        var raw = cfg.getString(key) ?: fallback.getString(key)
        if (raw == null) {
            plugin.logger.warning("Missing language key: $key")
            return mm.deserialize("<red>[missing: $key]</red>")
        }
        if (raw.isBlank()) return Component.empty()
        raw = raw.replace("{prefix}", prefix)
        placeholders.forEach { (k, v) -> raw = raw!!.replace("{$k}", mm.escapeTags(v)) }
        return mm.deserialize(raw!!)
    }

    /** Sends a message to the console sender. */
    fun console(key: String, vararg placeholders: Pair<String, String>) {
        if (!Bukkit.isPrimaryThread()) {
            if (plugin.isEnabled) {
                Bukkit.getScheduler().runTask(plugin, Runnable { console(key, *placeholders) })
            } else {
                plugin.logger.info(mm.stripTags((cfg.getString(key) ?: fallback.getString(key) ?: key).replace("{prefix}", "")))
            }
            return
        }
        val component = get(key, *placeholders)
        if (component != Component.empty()) plugin.server.consoleSender.sendMessage(component)
    }

    /** Sends a message to a CommandSender. */
    fun send(sender: CommandSender, key: String, vararg placeholders: Pair<String, String>) {
        val component = get(key, *placeholders)
        if (component != Component.empty()) sender.sendMessage(component)
    }
}
