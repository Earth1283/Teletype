package io.github.Earth1283.teletype.config

import org.bukkit.configuration.file.YamlConfiguration
import org.bukkit.plugin.java.JavaPlugin
import java.io.File
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets

object ConfigUpdater {
    fun update(plugin: JavaPlugin, resourceName: String) {
        val configFile = File(plugin.dataFolder, resourceName)
        if (!configFile.exists()) {
            return
        }

        val userConfig = runCatching {
            YamlConfiguration.loadConfiguration(configFile)
        }.getOrNull() ?: return

        if (userConfig.getKeys(true).isEmpty()) {
            plugin.logger.warning("Configuration file $resourceName is empty or could not be parsed. Skipping auto-update to prevent data loss.")
            return
        }

        val resourceStream = plugin.getResource(resourceName) ?: return
        val defaultConfig = YamlConfiguration.loadConfiguration(
            InputStreamReader(resourceStream, StandardCharsets.UTF_8)
        )

        var modified = false
        for (key in defaultConfig.getKeys(true)) {
            if (defaultConfig.isConfigurationSection(key)) {
                if (!userConfig.contains(key)) {
                    userConfig.createSection(key)
                    runCatching {
                        val comments = defaultConfig.getComments(key)
                        if (comments.isNotEmpty()) {
                            userConfig.setComments(key, comments)
                        }
                        val inlineComments = defaultConfig.getInlineComments(key)
                        if (inlineComments.isNotEmpty()) {
                            userConfig.setInlineComments(key, inlineComments)
                        }
                    }
                    modified = true
                }
                continue
            }

            if (!userConfig.contains(key)) {
                userConfig.set(key, defaultConfig.get(key))

                runCatching {
                    val comments = defaultConfig.getComments(key)
                    if (comments.isNotEmpty()) {
                        userConfig.setComments(key, comments)
                    }
                    val inlineComments = defaultConfig.getInlineComments(key)
                    if (inlineComments.isNotEmpty()) {
                        userConfig.setInlineComments(key, inlineComments)
                    }
                }
                modified = true
            }
        }

        if (modified) {
            runCatching {
                userConfig.save(configFile)
                plugin.logger.info("Auto-updated $resourceName with missing default keys.")
            }.onFailure { e ->
                plugin.logger.severe("Failed to auto-update $resourceName: ${e.message}")
            }
        }
    }
}
