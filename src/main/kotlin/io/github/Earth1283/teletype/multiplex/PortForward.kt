package io.github.Earth1283.teletype.multiplex

import kotlinx.serialization.Serializable

@Serializable
data class PortForward(
    val id: String = "",
    val label: String = "",
    val externalPort: Int,
    val targetPort: Int,
    val enabled: Boolean = true,
)
