package io.github.Earth1283.teletype.config

import io.github.Earth1283.teletype.Teletype
import java.io.File
import java.util.UUID

class TeletypeConfig(private val plugin: Teletype) {
    private val config get() = plugin.config

    val port: Int get() = config.getInt("web-port", 8080)
    val jwtExpiryHours: Long get() = config.getLong("jwt-expiry-hours", 24)

    val filesRoot: File by lazy {
        val configured = config.getString("files-root")
        if (!configured.isNullOrBlank()) File(configured) else File(System.getProperty("user.dir"))
    }

    val jwtSecret: String by lazy {
        var secret = config.getString("jwt-secret")
        if (secret.isNullOrBlank()) {
            secret = UUID.randomUUID().toString().replace("-", "") +
                    UUID.randomUUID().toString().replace("-", "")
            config.set("jwt-secret", secret)
            plugin.saveConfig()
        }
        secret
    }
}
