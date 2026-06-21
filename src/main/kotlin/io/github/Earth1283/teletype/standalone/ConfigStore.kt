package io.github.Earth1283.teletype.standalone

import java.io.File
import java.util.Properties

class ConfigStore {
    private val configFile = File(System.getProperty("user.home"), ".teletype/config.properties")
    private val props = Properties()

    init {
        if (configFile.exists()) {
            configFile.inputStream().use { props.load(it) }
        }
    }

    val host: String? get() = props.getProperty("host")
    val port: Int? get() = props.getProperty("port")?.toIntOrNull()
    val token: String? get() = props.getProperty("token")

    fun save(host: String, port: Int, token: String) {
        props["host"] = host
        props["port"] = port.toString()
        props["token"] = token
        configFile.parentFile.mkdirs()
        configFile.outputStream().use { props.store(it, "Teletype standalone config") }
    }

    fun clearToken() {
        props.remove("token")
        if (configFile.exists()) {
            configFile.outputStream().use { props.store(it, "Teletype standalone config") }
        }
    }
}
