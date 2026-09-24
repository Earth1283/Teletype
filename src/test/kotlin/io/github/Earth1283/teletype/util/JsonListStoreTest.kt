package io.github.Earth1283.teletype.util

import io.github.Earth1283.teletype.multiplex.PortForward
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class JsonListStoreTest {
    @TempDir
    lateinit var tempDir: Path

    @Test
    fun `corrupt files are moved aside instead of being overwritten`() = runBlocking {
        val file = tempDir.resolve("forwards.json").toFile().apply { writeText("{ not json") }
        val store = JsonListStore(file, PortForward.serializer(), PortForward::id)

        store.load()
        store.add(PortForward(id = "a", externalPort = 1, targetPort = 2))

        val backups = tempDir.toFile().listFiles { f: File -> f.name.startsWith("forwards.json.corrupt-") }.orEmpty()
        assertEquals(1, backups.size)
        assertEquals("{ not json", backups.single().readText())
        assertTrue(file.readText().contains("\"id\": \"a\""))
    }

    @Test
    fun `atomic writes leave no temp files behind`() = runBlocking {
        val file = tempDir.resolve("forwards.json").toFile()
        val store = JsonListStore(file, PortForward.serializer(), PortForward::id)
        repeat(3) { store.add(PortForward(id = "f$it", externalPort = it + 1, targetPort = 2)) }

        assertEquals(listOf("forwards.json"), tempDir.toFile().list()!!.toList())
    }
}
