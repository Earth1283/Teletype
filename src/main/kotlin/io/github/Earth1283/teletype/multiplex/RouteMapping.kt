package io.github.Earth1283.teletype.multiplex

import kotlinx.serialization.Serializable

@Serializable
data class RouteMapping(
    val id: String = "",
    val label: String = "",
    val prefix: String,
    val targetPort: Int,
    val enabled: Boolean = true,
    val rateLimitPerMinute: Int = 120,
) {
    private val normalizedPrefix: String get() = prefix.trimEnd('/').ifEmpty { "/" }

    fun matches(path: String): Boolean {
        val p = normalizedPrefix
        return p == "/" || path == p || path.startsWith("$p/")
    }

    val shadowsPanel: Boolean
        get() = PANEL_PATHS.any { matches(it) }

    companion object {
        private val PANEL_PATHS = listOf("/", "/api", "/api/auth/challenge", "/ws/console", "/assets/index.js", "/favicon.svg", "/icons.svg")
    }
}
