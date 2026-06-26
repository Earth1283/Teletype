package io.github.Earth1283.teletype.multiplex

import org.junit.jupiter.api.io.TempDir
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import java.nio.file.Path

class PortForwardStoreTest {
    @TempDir
    lateinit var tempDir: Path

    @Test
    fun `persists port forwards and reloads them`() {
        val store = PortForwardStore(tempDir.toFile())
        val forward = PortForward(
            id = "query",
            label = "Query",
            externalPort = 25565,
            targetPort = 25566,
            enabled = true,
        )

        store.addForward(forward)

        val reloaded = PortForwardStore(tempDir.toFile())
        reloaded.load()

        assertEquals(listOf(forward), reloaded.getForwards())
    }

    @Test
    fun `updates and removes port forwards by id`() {
        val store = PortForwardStore(tempDir.toFile())
        store.addForward(PortForward(id = "query", externalPort = 25565, targetPort = 25566))

        assertTrue(store.updateForward(PortForward(id = "query", externalPort = 25565, targetPort = 25567)))
        assertEquals(25567, store.getForward("query")?.targetPort)

        assertFalse(store.updateForward(PortForward(id = "missing", externalPort = 25568, targetPort = 25569)))
        assertTrue(store.removeForward("query"))
        assertNull(store.getForward("query"))
        assertFalse(store.removeForward("query"))
    }

    @Test
    fun `ignores invalid persisted port forward json`() {
        tempDir.resolve("port-forwards.json").toFile().writeText("not-json")
        val store = PortForwardStore(tempDir.toFile())

        store.load()

        assertTrue(store.getForwards().isEmpty())
    }
}
