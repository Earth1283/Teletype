package io.github.Earth1283.teletype.web

import io.github.Earth1283.teletype.Teletype
import io.ktor.network.tls.certificates.buildKeyStore
import io.ktor.network.tls.certificates.saveToFile
import java.io.File
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.time.Duration
import java.time.Instant

class TlsManager(private val plugin: Teletype) {

    data class LoadedKeyStore(val keyStore: KeyStore, val alias: String, val storePassword: String, val keyPassword: String)

    fun load(): LoadedKeyStore {
        val cfg = plugin.teletypeConfig
        return if (cfg.tlsMode == "keystore") {
            LoadedKeyStore(
                keyStore = loadExternal(cfg.tlsKeystorePath, cfg.tlsKeystorePassword),
                alias = cfg.tlsKeyAlias,
                storePassword = cfg.tlsKeystorePassword,
                keyPassword = cfg.tlsKeyPassword.ifBlank { cfg.tlsKeystorePassword },
            )
        } else {
            LoadedKeyStore(autoSelfSigned(), SELF_SIGNED_ALIAS, DEFAULT_PASSWORD, DEFAULT_PASSWORD)
        }
    }

    private fun autoSelfSigned(): KeyStore {
        val ksFile = File(plugin.dataFolder, "keystore.jks")
        val existing = ksFile.takeIf { it.exists() }?.let { file ->
            KeyStore.getInstance("JKS").apply { file.inputStream().use { load(it, DEFAULT_PASSWORD.toCharArray()) } }
        }
        if (existing != null && !expiresSoon(existing)) return existing

        plugin.messages.console("tls.generating", "path" to ksFile.absolutePath)
        val ks = buildKeyStore {
            certificate(SELF_SIGNED_ALIAS) {
                password = DEFAULT_PASSWORD
                domains = listOf("localhost", "127.0.0.1")
                daysValid = SELF_SIGNED_VALIDITY_DAYS
            }
        }
        ks.saveToFile(ksFile, DEFAULT_PASSWORD)
        plugin.messages.console("tls.cert-created")
        plugin.messages.console("tls.production-hint")
        return ks
    }

    private fun expiresSoon(ks: KeyStore): Boolean {
        val cert = ks.getCertificate(SELF_SIGNED_ALIAS) as? X509Certificate ?: return true
        return cert.notAfter.toInstant().isBefore(Instant.now().plus(RENEW_BEFORE_EXPIRY))
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

    companion object {
        const val DEFAULT_PASSWORD = "teletype-tls"
        private const val SELF_SIGNED_ALIAS = "teletype"
        private const val SELF_SIGNED_VALIDITY_DAYS = 365L * 3
        private val RENEW_BEFORE_EXPIRY: Duration = Duration.ofDays(30)
    }
}
