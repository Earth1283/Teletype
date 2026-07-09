package io.github.Earth1283.teletype.actions

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.Snippet
import io.github.Earth1283.teletype.web.model.SnippetCategory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
private data class StoreData(
    val categories: List<SnippetCategory>,
    val snippets: List<Snippet>
)

class SnippetStore(private val plugin: Teletype) {
    private val file = File(plugin.dataFolder, "snippets.json")
    private val json = Json { prettyPrint = true; encodeDefaults = true; ignoreUnknownKeys = true }

    private val categories = mutableListOf<SnippetCategory>()
    private val snippets = mutableListOf<Snippet>()

    @Synchronized fun getCategories(): List<SnippetCategory> = categories.toList()
    @Synchronized fun getSnippets(): List<Snippet> = snippets.toList()
    @Synchronized fun findSnippet(id: String): Snippet? = snippets.find { it.id == id }

    @Synchronized fun load() {
        if (!file.exists()) { seedDefaults(); saveNow(); return }
        try {
            val data = json.decodeFromString<StoreData>(file.readText())
            categories.clear(); categories.addAll(data.categories)
            snippets.clear(); snippets.addAll(data.snippets)
        } catch (e: Exception) {
            plugin.messages.console("data.snippets-load-failed", "error" to (e.message ?: "unknown"))
            seedDefaults(); saveNow()
        }
    }

    private fun saveNow() {
        plugin.dataFolder.mkdirs()
        file.writeText(json.encodeToString(StoreData(categories.toList(), snippets.toList())))
    }

    // Off the Ktor request thread — saveNow() does a full-file rewrite on every mutation.
    private suspend fun save() = withContext(Dispatchers.IO) { saveNow() }

    private fun seedDefaults() {
        val quickId = plugin.teletypeConfig.actionsQuickActionsCategoryId
        categories.clear()
        categories += listOf(
            SnippetCategory(quickId,       "Quick Actions", "#f59e0b", special = true),
            SnippetCategory("maintenance", "Maintenance",   "#a78bfa"),
            SnippetCategory("player",      "Player",        "#f472b6"),
            SnippetCategory("world",       "World",         "#60a5fa"),
        )
        snippets.clear()
        snippets += listOf(
            Snippet("default-1", "Force GC",           quickId, listOf("/gc")),
            Snippet("default-2", "Kill stale entities",quickId, listOf("/kill @e[type=!player]")),
            Snippet("default-3", "Save all worlds",    "maintenance",   listOf("/save-all")),
            Snippet("default-4", "Broadcast restart",  "maintenance",
                listOf("/say §c[!] Server restart in {minutes} minutes", "/save-all"),
                listOf("minutes")),
            Snippet("default-5", "Kick player",        "player",
                listOf("/kick {player} {reason}"),
                listOf("player", "reason")),
            Snippet("default-6", "Set time day",       "world", listOf("/time set day")),
        )
    }

    suspend fun addCategory(cat: SnippetCategory): Boolean {
        val added = synchronized(this) {
            if (categories.any { it.id == cat.id || it.name.equals(cat.name, ignoreCase = true) }) false
            else { categories += cat; true }
        }
        if (added) save()
        return added
    }

    suspend fun removeCategory(id: String): Boolean {
        var shouldSave = false
        val removed = synchronized(this) {
            if (categories.none { it.id == id }) return@synchronized false
            categories.removeIf { it.id == id }
            val fallback = categories.firstOrNull { !it.special }?.id ?: return@synchronized true
            val indices = snippets.indices.filter { snippets[it].categoryId == id }
            indices.forEach { i -> snippets[i] = snippets[i].copy(categoryId = fallback) }
            shouldSave = true
            true
        }
        if (shouldSave) save()
        return removed
    }

    suspend fun addSnippet(snippet: Snippet): Boolean {
        val added = synchronized(this) {
            if (snippets.any { it.id == snippet.id }) false
            else { snippets += snippet; true }
        }
        if (added) save()
        return added
    }

    suspend fun updateSnippet(updated: Snippet): Boolean {
        val didUpdate = synchronized(this) {
            val idx = snippets.indexOfFirst { it.id == updated.id }
            if (idx < 0) false else { snippets[idx] = updated; true }
        }
        if (didUpdate) save()
        return didUpdate
    }

    suspend fun removeSnippet(id: String): Boolean {
        val removed = synchronized(this) {
            if (snippets.none { it.id == id }) false
            else { snippets.removeIf { it.id == id }; true }
        }
        if (removed) save()
        return removed
    }
}
