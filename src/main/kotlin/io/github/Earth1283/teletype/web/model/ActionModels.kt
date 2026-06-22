package io.github.Earth1283.teletype.web.model

import kotlinx.serialization.Serializable

@Serializable
data class SnippetCategory(
    val id: String,
    val name: String,
    val color: String,
    val special: Boolean = false
)

@Serializable
data class Snippet(
    val id: String,
    val name: String,
    val categoryId: String,
    val cmds: List<String>,
    val vars: List<String> = emptyList()
)

@Serializable
data class ScheduledAction(
    val id: String,
    val snippetId: String,
    val label: String,
    val mode: String,
    val trigger: String,
    val intervalMs: Long? = null,
    val cronExpr: String? = null,
    val repeatCount: Int? = null,
    val runAt: Long? = null,
    val vars: Map<String, String> = emptyMap(),
    val status: String = "active",
    val runsRemaining: Int? = null,
    val lastRunMs: Long? = null,
    val lastRunOk: Boolean? = null
)

@Serializable
data class CreateCategoryRequest(val name: String, val color: String)

@Serializable
data class CreateSnippetRequest(
    val name: String,
    val categoryId: String,
    val cmds: List<String>
)

@Serializable
data class UpdateSnippetRequest(
    val name: String? = null,
    val categoryId: String? = null,
    val cmds: List<String>? = null
)

@Serializable
data class CreateScheduleRequest(
    val snippetId: String,
    val label: String,
    val mode: String,
    val trigger: String,
    val intervalMs: Long? = null,
    val cronExpr: String? = null,
    val repeatCount: Int? = null,
    val runAt: Long? = null,
    val vars: Map<String, String> = emptyMap()
)

@Serializable
data class ExecuteSnippetRequest(
    val vars: Map<String, String> = emptyMap()
)
