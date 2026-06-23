package io.github.Earth1283.teletype.multiplex

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList

class RouteStore(private val dataFolder: File) {
    private val file = File(dataFolder, "routes.json")
    private val routes = CopyOnWriteArrayList<RouteMapping>()
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    fun load() {
        if (!file.exists()) return
        runCatching {
            val list = json.decodeFromString<List<RouteMapping>>(file.readText())
            routes.clear()
            routes.addAll(list)
        }
    }

    fun getRoutes(): List<RouteMapping> = routes.toList()

    fun getRoute(id: String): RouteMapping? = routes.find { it.id == id }

    fun addRoute(route: RouteMapping) {
        routes.add(route)
        save()
    }

    fun updateRoute(route: RouteMapping): Boolean {
        val idx = routes.indexOfFirst { it.id == route.id }
        if (idx == -1) return false
        routes[idx] = route
        save()
        return true
    }

    fun removeRoute(id: String): Boolean {
        val removed = routes.removeIf { it.id == id }
        if (removed) save()
        return removed
    }

    fun findMatch(path: String): RouteMapping? =
        routes
            .filter { it.enabled && path.startsWith(it.prefix) }
            .maxByOrNull { it.prefix.length }

    private fun save() {
        dataFolder.mkdirs()
        file.writeText(json.encodeToString(routes.toList()))
    }
}
