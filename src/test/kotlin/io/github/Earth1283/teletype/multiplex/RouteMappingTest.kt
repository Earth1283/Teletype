package io.github.Earth1283.teletype.multiplex

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RouteMappingTest {
    private fun route(prefix: String) = RouteMapping(prefix = prefix, targetPort = 9000)

    @Test
    fun `prefixes match on path segment boundaries`() {
        val map = route("/map")
        assertTrue(map.matches("/map"))
        assertTrue(map.matches("/map/tiles/1.png"))
        assertFalse(map.matches("/mapping"))
        assertTrue(route("/map/").matches("/map/x"))
    }

    @Test
    fun `routes that would hide the panel are flagged`() {
        listOf("/", "/api", "/api/auth", "/ws", "/assets", "/favicon.svg").forEach {
            assertTrue(route(it).shadowsPanel, it)
        }
        listOf("/map", "/dynmap", "/apiary").forEach { assertFalse(route(it).shadowsPanel, it) }
    }
}
