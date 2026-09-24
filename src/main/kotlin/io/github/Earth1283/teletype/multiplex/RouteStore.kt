package io.github.Earth1283.teletype.multiplex

import io.github.Earth1283.teletype.util.JsonListStore
import java.io.File
import java.util.logging.Logger

class RouteStore(dataFolder: File, logger: Logger? = null) {
    private val store = JsonListStore(File(dataFolder, "routes.json"), RouteMapping.serializer(), RouteMapping::id, logger)

    fun load() = store.load()
    fun getRoutes(): List<RouteMapping> = store.all()
    fun getRoute(id: String): RouteMapping? = store.find(id)
    suspend fun addRoute(route: RouteMapping) = store.add(route)
    suspend fun updateRoute(route: RouteMapping): Boolean = store.update(route)
    suspend fun removeRoute(id: String): Boolean = store.remove(id)

    fun findMatch(path: String): RouteMapping? =
        store.all()
            .filter { it.enabled && it.matches(path) }
            .maxByOrNull { it.prefix.length }
}
