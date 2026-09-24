package io.github.Earth1283.teletype.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import java.util.logging.Logger

class JsonListStore<T>(
    private val file: File,
    itemSerializer: KSerializer<T>,
    private val idOf: (T) -> String,
    private val logger: Logger? = null,
) {
    private val serializer = ListSerializer(itemSerializer)
    private val items = CopyOnWriteArrayList<T>()
    private val saveMutex = Mutex()
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true; encodeDefaults = true }

    fun load() {
        if (!file.exists()) return
        runCatching { json.decodeFromString(serializer, file.readText()) }
            .onSuccess { items.clear(); items.addAll(it) }
            .onFailure { e ->
                val backup = file.quarantineCorrupt()
                logger?.warning("[Teletype] Could not read ${file.name} (${e.message}); moved it to ${backup?.name ?: "nowhere"} and started empty")
            }
    }

    fun all(): List<T> = items.toList()

    fun find(id: String): T? = items.find { idOf(it) == id }

    suspend fun add(item: T) {
        items.add(item)
        save()
    }

    suspend fun update(item: T): Boolean {
        val idx = items.indexOfFirst { idOf(it) == idOf(item) }
        if (idx == -1) return false
        items[idx] = item
        save()
        return true
    }

    suspend fun remove(id: String): Boolean {
        val removed = items.removeIf { idOf(it) == id }
        if (removed) save()
        return removed
    }

    private suspend fun save() = saveMutex.withLock {
        withContext(Dispatchers.IO) { file.writeTextAtomic(json.encodeToString(serializer, items.toList())) }
    }
}
