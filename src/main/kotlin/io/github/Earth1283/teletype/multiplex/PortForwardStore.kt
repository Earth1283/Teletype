package io.github.Earth1283.teletype.multiplex

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

    fun addForward(forward: PortForward) {
        forwards.add(forward)
        save()
    }

    fun updateForward(forward: PortForward): Boolean {
        val idx = forwards.indexOfFirst { it.id == forward.id }
        if (idx == -1) return false
        forwards[idx] = forward
        save()
        return true
    }

    fun removeForward(id: String): Boolean {
        val removed = forwards.removeIf { it.id == id }
        if (removed) save()
        return removed
    }

    private fun save() {
        dataFolder.mkdirs()
        file.writeText(json.encodeToString(forwards.toList()))
    }
}
