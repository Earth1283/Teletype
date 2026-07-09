package io.github.Earth1283.teletype.multiplex

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.io.TempDir
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import java.nio.file.Path

class RouteStoreTest {
    @TempDir
    lateinit var tempDir: Path

    @Test
    fun `persists routes and reloads them`() = runBlocking {
        val store = RouteStore(tempDir.toFile())
        val route = RouteMapping(
            id = "console",
            label = "Console",
            prefix = "/console",
            targetPort = 8081,
            enabled = true,
            rateLimitPerMinute = 30,
        )

        store.addRoute(route)

        val reloaded = RouteStore(tempDir.toFile())
        reloaded.load()

        assertEquals(listOf(route), reloaded.getRoutes())
    }

    @Test
    fun `finds the longest enabled prefix match`() = runBlocking {
        val store = RouteStore(tempDir.toFile())
        val broad = RouteMapping(id = "api", prefix = "/api", targetPort = 8080)
        val specific = RouteMapping(id = "files", prefix = "/api/files", targetPort = 8082)
        val disabled = RouteMapping(id = "disabled", prefix = "/api/files/private", targetPort = 8083, enabled = false)
        store.addRoute(broad)
        store.addRoute(specific)
        store.addRoute(disabled)

        assertEquals(specific, store.findMatch("/api/files/index.html"))
    }

    @Test
    fun `updates and removes routes by id`() = runBlocking {
        val store = RouteStore(tempDir.toFile())
        store.addRoute(RouteMapping(id = "api", prefix = "/api", targetPort = 8080))

        assertTrue(store.updateRoute(RouteMapping(id = "api", prefix = "/api", targetPort = 9090)))
        assertEquals(9090, store.getRoute("api")?.targetPort)

        assertFalse(store.updateRoute(RouteMapping(id = "missing", prefix = "/missing", targetPort = 9091)))
        assertTrue(store.removeRoute("api"))
        assertNull(store.getRoute("api"))
        assertFalse(store.removeRoute("api"))
    }

    @Test
    fun `ignores invalid persisted route json`() {
        tempDir.resolve("routes.json").toFile().writeText("not-json")
        val store = RouteStore(tempDir.toFile())

        store.load()

        assertTrue(store.getRoutes().isEmpty())
    }
}
