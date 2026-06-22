package io.github.Earth1283.teletype.web

import io.github.Earth1283.teletype.Teletype
import io.ktor.network.tls.certificates.buildKeyStore
import io.ktor.network.tls.certificates.saveToFile
import java.io.File
import java.security.KeyStore

class TlsManager(private val plugin: Teletype) {

    fun loadKeyStore(): KeyStore {
        val cfg = plugin.teletypeConfig
        return when (cfg.tlsMode) {
            "keystore" -> loadExternal(cfg.tlsKeystorePath, cfg.tlsKeystorePassword)
            else -> autoSelfSigned()
        }
    }

    private fun autoSelfSigned(): KeyStore {
        val ksFile = File(plugin.dataFolder, "keystore.jks")
        val pass = "teletype-tls"
        if (!ksFile.exists()) {
            plugin.logger.info("TLS: generating self-signed certificate → ${ksFile.absolutePath}")
            val ks = buildKeyStore {
                certificate("teletype") {
                    password = pass
                    domains = listOf("localhost", "127.0.0.1")
                    daysValid = 365 * 3
                }
            }
            ks.saveToFile(ksFile, pass)
            plugin.logger.info("TLS: self-signed cert created. Browsers will show a security warning — accept once.")
            plugin.logger.info("TLS: for production, supply a real certificate via server.tls.mode: keystore in config.yml")
            return ks
        }
        return KeyStore.getInstance("JKS").apply {
            ksFile.inputStream().use { load(it, pass.toCharArray()) }
        }
    }

    private fun loadExternal(path: String, password: String): KeyStore {
        val file = File(path).let { if (it.isAbsolute) it else File(plugin.dataFolder, path) }
        require(file.exists()) { "TLS keystore not found: ${file.absolutePath}" }
        val type = when (file.extension.lowercase()) {
            "p12", "pfx" -> "PKCS12"
            else -> "JKS"
        }
        return KeyStore.getInstance(type).apply {
            file.inputStream().use { load(it, password.toCharArray()) }
        }
    }
}
