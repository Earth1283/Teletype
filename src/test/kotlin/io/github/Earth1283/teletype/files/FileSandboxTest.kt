package io.github.Earth1283.teletype.files

import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FileSandboxTest {
    @TempDir
    lateinit var tempDir: Path

    private val root get() = tempDir.resolve("root").toFile().apply { mkdirs() }

    @Test
    fun `empty path resolves to the root, which is flagged as root`() {
        val sandbox = FileSandbox(root)
        val resolved = assertNotNull(sandbox.resolve(""))
        assertTrue(sandbox.isRoot(resolved))
        assertTrue(sandbox.isRoot(assertNotNull(sandbox.resolve("./sub/.."))))
    }

    @Test
    fun `dot-dot traversal outside the root is rejected`() {
        val sandbox = FileSandbox(root)
        assertNull(sandbox.resolve("../outside.txt"))
        assertNull(sandbox.resolve("sub/../../outside.txt"))
        assertNotNull(sandbox.resolve("sub/../inside.txt"))
    }

    @Test
    fun `sibling folder sharing the root prefix is not inside the root`() {
        val sandbox = FileSandbox(root)
        tempDir.resolve("root-evil").toFile().mkdirs()
        assertNull(sandbox.resolve("../root-evil/x"))
    }

    @Test
    fun `symlink pointing outside the root is rejected`() {
        val outside = tempDir.resolve("outside").toFile().apply { mkdirs() }
        Files.createSymbolicLink(root.toPath().resolve("link"), outside.toPath())
        assertNull(FileSandbox(root).resolve("link/secret.txt"))
    }

    @Test
    fun `resolveChild only accepts plain names`() {
        val sandbox = FileSandbox(root)
        assertEquals("a.txt", sandbox.resolveChild(root, "a.txt")?.name)
        assertEquals("a.txt", sandbox.resolveChild(root, "nested/a.txt")?.name)
        assertNull(sandbox.resolveChild(root, ".."))
        assertNull(sandbox.resolveChild(root, ""))
    }

    @Test
    fun `walk does not descend into symlinked folders and respects the visit cap`() {
        val outside = tempDir.resolve("outside").toFile().apply { mkdirs() }
        File(outside, "secret.txt").writeText("x")
        Files.createSymbolicLink(root.toPath().resolve("link"), outside.toPath())
        repeat(5) { File(root, "f$it.txt").writeText("x") }
        val sandbox = FileSandbox(root)

        val names = sandbox.walkWithoutFollowingLinks(sandbox.root, 1_000).map { it.name }.toList()
        assertFalse("secret.txt" in names)
        assertTrue(sandbox.walkWithoutFollowingLinks(sandbox.root, 3).count() <= 3)
    }
}
