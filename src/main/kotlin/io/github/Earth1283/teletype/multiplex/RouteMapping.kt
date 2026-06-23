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
)
