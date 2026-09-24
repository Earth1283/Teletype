package io.github.Earth1283.teletype.files

import java.io.File
import java.nio.file.Files

class FileSandbox(root: File) {
    val root: File = root.canonicalFile
    private val rootPath = this.root.path

    fun resolve(path: String): File? =
        File(root, path).canonicalFile.takeIf(::contains)

    fun contains(file: File): Boolean =
        file.path == rootPath || file.path.startsWith(rootPath + File.separator)

    fun isRoot(file: File): Boolean = file.path == rootPath

    fun relativePath(file: File): String = file.relativeTo(root).path.replace(File.separatorChar, '/')

    fun resolveChild(dir: File, filename: String): File? {
        val cleanName = File(filename).name.takeIf { it.isNotBlank() && it != "." && it != ".." } ?: return null
        val dest = File(dir, cleanName).canonicalFile
        return dest.takeIf { it.parentFile?.path == dir.canonicalFile.path && contains(it) }
    }

    fun walkWithoutFollowingLinks(start: File, maxVisited: Int): Sequence<File> {
        var visited = 0
        return start.walkTopDown()
            .onEnter { it == start || !Files.isSymbolicLink(it.toPath()) }
            .takeWhile { visited++ < maxVisited }
            .filter { it != start }
    }
}
