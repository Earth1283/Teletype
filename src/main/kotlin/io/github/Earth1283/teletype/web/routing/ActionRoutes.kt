package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.actions.CronParser
import io.github.Earth1283.teletype.web.model.CreateCategoryRequest
import io.github.Earth1283.teletype.web.model.CreateScheduleRequest
import io.github.Earth1283.teletype.web.model.CreateSnippetRequest
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.model.ExecuteSnippetRequest
import io.github.Earth1283.teletype.web.model.ScheduledAction
import io.github.Earth1283.teletype.web.model.Snippet
import io.github.Earth1283.teletype.web.model.SnippetCategory
import io.github.Earth1283.teletype.web.model.StatusResponse
import io.github.Earth1283.teletype.web.model.UpdateSnippetRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.createRouteScopedPlugin
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import java.util.UUID

private val CATEGORY_ID_SANITIZER = Regex("[^a-z0-9]+")
private val SNIPPET_VAR_PATTERN = Regex("\\{(\\w+)\\}")
private val SCHEDULE_MODES = setOf("once", "ntimes", "forever")
private const val MIN_INTERVAL_MS = 1_000L

private fun variablesIn(cmds: List<String>): List<String> =
    cmds.flatMap { cmd -> SNIPPET_VAR_PATTERN.findAll(cmd).map { it.groupValues[1] } }.distinct()

fun Route.actionRoutes(plugin: Teletype) {
    val store = plugin.snippetStore
    val scheduler = plugin.snippetScheduler
    val cfg = plugin.teletypeConfig

    install(createRouteScopedPlugin("TeletypeActionsGate") {
        onCall { call ->
            if (!cfg.actionsEnabled) {
                call.respond(HttpStatusCode.Forbidden, ErrorResponse("Actions are disabled (actions.enabled: false)"))
            }
        }
    }) {}

    fun requireSchedulingEnabled() {
        if (!cfg.actionsSchedulingEnabled) forbidden("Scheduling is disabled (actions.scheduling-enabled: false)")
    }

    fun requireCategory(id: String) {
        if (!store.hasCategory(id)) badRequest("Unknown category: $id")
    }

    fun validateSchedule(req: CreateScheduleRequest) {
        if (req.mode !in SCHEDULE_MODES) badRequest("Mode must be one of ${SCHEDULE_MODES.joinToString()}")
        if (req.intervalMs != null && req.intervalMs < MIN_INTERVAL_MS) badRequest("Interval must be at least 1 second")
        if (req.mode == "ntimes" && (req.repeatCount ?: 1) < 1) badRequest("Repeat count must be at least 1")
        if (req.cronExpr != null && !CronParser.isValid(req.cronExpr)) badRequest("Invalid cron expression")
    }

    route("/categories") {
        get { call.respond(store.getCategories()) }

        post {
            val req = call.receive<CreateCategoryRequest>()
            val name = req.name.trim().ifEmpty { badRequest("Name required") }
            val id = name.lowercase().replace(CATEGORY_ID_SANITIZER, "-")
            val cat = SnippetCategory(id, name, req.color.ifBlank { "#6e6e80" })
            if (!store.addCategory(cat)) conflict("Category already exists")
            call.respond(HttpStatusCode.Created, cat)
            auditAsync(plugin, "category_create", name)
        }

        delete("/{id}") {
            val id = call.pathParam("id")
            val cat = store.getCategories().find { it.id == id } ?: notFound()
            if (cat.special) forbidden("Cannot delete built-in category")
            store.removeCategory(id)
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "category_delete", id)
        }
    }

    route("/snippets") {
        get { call.respond(store.getSnippets()) }

        post {
            val req = call.receive<CreateSnippetRequest>()
            val name = req.name.trim().ifEmpty { badRequest("Name required") }
            val cmds = req.cmds.filter { it.isNotBlank() }.ifEmpty { badRequest("At least one command required") }
            requireCategory(req.categoryId)
            if (store.getSnippets().size >= cfg.actionsMaxSnippets) badRequest("Snippet limit reached (max ${cfg.actionsMaxSnippets})")

            val snippet = Snippet(UUID.randomUUID().toString(), name, req.categoryId, cmds, variablesIn(cmds))
            store.addSnippet(snippet)
            call.respond(HttpStatusCode.Created, snippet)
            auditAsync(plugin, "snippet_create", "$name: ${cmds.joinToString(" ; ")}")
        }

        put("/{id}") {
            val existing = store.findSnippet(call.pathParam("id")) ?: notFound()
            val req = call.receive<UpdateSnippetRequest>()
            req.categoryId?.let(::requireCategory)
            val cmds = req.cmds?.filter { it.isNotBlank() }?.ifEmpty { badRequest("At least one command required") } ?: existing.cmds
            val updated = existing.copy(
                name       = req.name?.trim()?.ifEmpty { badRequest("Name required") } ?: existing.name,
                categoryId = req.categoryId ?: existing.categoryId,
                cmds       = cmds,
                vars       = variablesIn(cmds),
            )
            store.updateSnippet(updated)
            call.respond(updated)
            auditAsync(plugin, "snippet_update", "${updated.name}: ${cmds.joinToString(" ; ")}")
        }

        delete("/{id}") {
            val id = call.pathParam("id")
            val snippet = store.findSnippet(id) ?: notFound()
            store.removeSnippet(id)
            val removedSchedules = scheduler.removeForSnippet(id)
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "snippet_delete", "${snippet.name} (and $removedSchedules schedule(s))")
        }
    }

    post("/execute/{snippetId}") {
        val snippet = store.findSnippet(call.pathParam("snippetId")) ?: notFound("Snippet not found")
        val req = call.receive<ExecuteSnippetRequest>()
        scheduler.executeNow(snippet, req.vars)
        call.respond(StatusResponse("dispatched"))
        auditAsync(plugin, "run_snippet", "${snippet.name} vars=${req.vars}")
    }

    route("/schedule") {
        get { call.respond(scheduler.getActions()) }

        post {
            requireSchedulingEnabled()
            val req = call.receive<CreateScheduleRequest>()
            validateSchedule(req)
            val snippet = store.findSnippet(req.snippetId) ?: notFound("Snippet not found")
            if (scheduler.getActions().size >= cfg.actionsMaxScheduled)
                badRequest("Scheduled action limit reached (max ${cfg.actionsMaxScheduled})")

            val action = ScheduledAction(
                id            = UUID.randomUUID().toString(),
                snippetId     = req.snippetId,
                label         = req.label.ifBlank { snippet.name },
                mode          = req.mode,
                trigger       = req.trigger,
                intervalMs    = req.intervalMs,
                cronExpr      = req.cronExpr,
                repeatCount   = req.repeatCount,
                runsRemaining = req.repeatCount,
                runAt         = req.runAt,
                vars          = req.vars
            )
            scheduler.add(action)
            call.respond(HttpStatusCode.Created, action)
            auditAsync(plugin, "schedule_create", "${action.label} (${req.snippetId})")
        }

        delete("/{id}") {
            val id = call.pathParam("id")
            if (!scheduler.remove(id)) notFound()
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "schedule_delete", id)
        }

        patch("/{id}/pause") {
            val id = call.pathParam("id")
            if (!scheduler.pause(id)) notFound()
            call.respond(StatusResponse("paused"))
            auditAsync(plugin, "schedule_pause", id)
        }

        patch("/{id}/resume") {
            requireSchedulingEnabled()
            val id = call.pathParam("id")
            if (!scheduler.resume(id)) notFound()
            call.respond(StatusResponse("resumed"))
            auditAsync(plugin, "schedule_resume", id)
        }
    }
}
