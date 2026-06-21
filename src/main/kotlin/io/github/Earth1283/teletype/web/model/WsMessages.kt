package io.github.Earth1283.teletype.web.model

import kotlinx.serialization.Serializable

@Serializable
data class WsMessage(
    val type: String,
    val payload: String
)
