package io.github.Earth1283.teletype.multiplex

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList

class PortForwardStore(private val dataFolder: File) {
    private val file = File(dataFolder, "port-forwards.json")
    private val forwards = CopyOnWriteArrayList<PortForward>()
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    fun load() {
        if (!file.exists()) return
        runCatching {
            val list = json.decodeFromString<List<PortForward>>(file.readText())
            forwards.clear()
            forwards.addAll(list)
        }
    }

    fun getForwards(): List<PortForward> = forwards.toList()

    fun getForward(id: String): PortForward? = forwards.find { it.id == id }

    suspend fun addForward(forward: PortForward) {
        forwards.add(forward)
        save()
    }

    suspend fun updateForward(forward: PortForward): Boolean {
        val idx = forwards.indexOfFirst { it.id == forward.id }
        if (idx == -1) return false
        forwards[idx] = forward
        save()
        return true
    }

    suspend fun removeForward(id: String): Boolean {
        val removed = forwards.removeIf { it.id == id }
        if (removed) save()
        return removed
    }

    // Off the Ktor request thread — every forward mutation rewrites the whole file.
    private suspend fun save() = withContext(Dispatchers.IO) {
        dataFolder.mkdirs()
        file.writeText(json.encodeToString(forwards.toList()))
    }
}
