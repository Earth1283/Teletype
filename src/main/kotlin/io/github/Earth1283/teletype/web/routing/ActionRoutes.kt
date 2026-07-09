package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
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

fun Route.actionRoutes(plugin: Teletype) {
    val store = plugin.snippetStore
    val scheduler = plugin.snippetScheduler

    route("/categories") {
        get { call.respond(store.getCategories()) }

        post {
            val req = call.receive<CreateCategoryRequest>()
            if (req.name.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Name required")); return@post
            }
            val id = req.name.trim().lowercase().replace(CATEGORY_ID_SANITIZER, "-")
            val cat = SnippetCategory(id, req.name.trim(), req.color.ifBlank { "#6e6e80" })
            if (!store.addCategory(cat)) {
                call.respond(HttpStatusCode.Conflict, ErrorResponse("Category already exists")); return@post
            }
            call.respond(HttpStatusCode.Created, cat)
            auditAsync(plugin, "category_create", req.name.trim())
        }

        delete("/{id}") {
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            val cat = store.getCategories().find { it.id == id }
                ?: return@delete call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
            if (cat.special) {
                call.respond(HttpStatusCode.Forbidden, ErrorResponse("Cannot delete built-in category"))
                return@delete
            }
            store.removeCategory(id)
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "category_delete", id)
        }
    }

    route("/snippets") {
        get { call.respond(store.getSnippets()) }

        post {
            val req = call.receive<CreateSnippetRequest>()
            if (req.name.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Name required")); return@post
            }
            val cmds = req.cmds.filter { it.isNotBlank() }
            if (cmds.isEmpty()) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("At least one command required")); return@post
            }
            val vars = cmds.flatMap { SNIPPET_VAR_PATTERN.findAll(it).map { m -> m.groupValues[1] }.toList() }.distinct()
            val snippet = Snippet(UUID.randomUUID().toString(), req.name.trim(), req.categoryId, cmds, vars)
            store.addSnippet(snippet)
            call.respond(HttpStatusCode.Created, snippet)
        }

        put("/{id}") {
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            val existing = store.findSnippet(id)
                ?: return@put call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
            val req = call.receive<UpdateSnippetRequest>()
            val cmds = req.cmds?.filter { it.isNotBlank() } ?: existing.cmds
            val vars = cmds.flatMap { SNIPPET_VAR_PATTERN.findAll(it).map { m -> m.groupValues[1] }.toList() }.distinct()
            val updated = existing.copy(
                name       = req.name?.trim()    ?: existing.name,
                categoryId = req.categoryId      ?: existing.categoryId,
                cmds       = cmds,
                vars       = vars
            )
            store.updateSnippet(updated)
            call.respond(updated)
        }

        delete("/{id}") {
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            if (!store.removeSnippet(id)) {
                call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found")); return@delete
            }
            call.respond(StatusResponse("deleted"))
        }
    }

    post("/execute/{snippetId}") {
        val id = call.parameters["snippetId"]
            ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
        val snippet = store.findSnippet(id)
            ?: run { call.respond(HttpStatusCode.NotFound, ErrorResponse("Snippet not found")); return@post }
        val req = call.receive<ExecuteSnippetRequest>()
        scheduler.executeNow(id, req.vars)
        call.respond(StatusResponse("dispatched"))
        auditAsync(plugin, "run_snippet", "${snippet.name} vars=${req.vars}")
    }

    route("/schedule") {
        get { call.respond(scheduler.getActions()) }

        post {
            val req = call.receive<CreateScheduleRequest>()
            if (store.findSnippet(req.snippetId) == null) {
                call.respond(HttpStatusCode.NotFound, ErrorResponse("Snippet not found")); return@post
            }
            val action = ScheduledAction(
                id            = UUID.randomUUID().toString(),
                snippetId     = req.snippetId,
                label         = req.label.ifBlank { store.findSnippet(req.snippetId)!!.name },
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
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            if (!scheduler.remove(id)) {
                call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found")); return@delete
            }
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "schedule_delete", id)
        }

        patch("/{id}/pause") {
            val id = call.parameters["id"]
                ?: return@patch call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            if (!scheduler.pause(id)) {
                call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found")); return@patch
            }
            call.respond(StatusResponse("paused"))
        }

        patch("/{id}/resume") {
            val id = call.parameters["id"]
                ?: return@patch call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing id"))
            if (!scheduler.resume(id)) {
                call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found")); return@patch
            }
            call.respond(StatusResponse("resumed"))
        }
    }
}
