package io.github.Earth1283.teletype.actions

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.Snippet
import io.github.Earth1283.teletype.web.model.SnippetCategory
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
        if (!file.exists()) { seedDefaults(); save(); return }
        try {
            val data = json.decodeFromString<StoreData>(file.readText())
            categories.clear(); categories.addAll(data.categories)
            snippets.clear(); snippets.addAll(data.snippets)
        } catch (e: Exception) {
            plugin.logger.warning("Failed to load snippets.json: ${e.message}. Seeding defaults.")
            seedDefaults(); save()
        }
    }

    @Synchronized fun save() {
        plugin.dataFolder.mkdirs()
        file.writeText(json.encodeToString(StoreData(categories.toList(), snippets.toList())))
    }

    private fun seedDefaults() {
        categories.clear()
        categories += listOf(
            SnippetCategory("quick-actions", "Quick Actions", "#f59e0b", special = true),
            SnippetCategory("maintenance",   "Maintenance",   "#a78bfa"),
            SnippetCategory("player",        "Player",        "#f472b6"),
            SnippetCategory("world",         "World",         "#60a5fa"),
        )
        snippets.clear()
        snippets += listOf(
            Snippet("default-1", "Force GC",           "quick-actions", listOf("/gc")),
            Snippet("default-2", "Kill stale entities","quick-actions", listOf("/kill @e[type=!player]")),
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

    @Synchronized fun addCategory(cat: SnippetCategory): Boolean {
        if (categories.any { it.id == cat.id || it.name.equals(cat.name, ignoreCase = true) }) return false
        categories += cat; save(); return true
    }

    @Synchronized fun removeCategory(id: String): Boolean {
        if (categories.none { it.id == id }) return false
        categories.removeIf { it.id == id }
        val fallback = categories.firstOrNull { !it.special }?.id ?: return true
        val indices = snippets.indices.filter { snippets[it].categoryId == id }
        indices.forEach { i -> snippets[i] = snippets[i].copy(categoryId = fallback) }
        save(); return true
    }

    @Synchronized fun addSnippet(snippet: Snippet): Boolean {
        if (snippets.any { it.id == snippet.id }) return false
        snippets += snippet; save(); return true
    }

    @Synchronized fun updateSnippet(updated: Snippet): Boolean {
        val idx = snippets.indexOfFirst { it.id == updated.id }
        if (idx < 0) return false
        snippets[idx] = updated; save(); return true
    }

    @Synchronized fun removeSnippet(id: String): Boolean {
        if (snippets.none { it.id == id }) return false
        snippets.removeIf { it.id == id }; save(); return true
    }
}
