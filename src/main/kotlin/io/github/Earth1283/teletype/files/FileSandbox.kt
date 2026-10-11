package io.github.Earth1283.teletype.files

import java.io.File
import java.io.IOException
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.BasicFileAttributes

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

    companion object {
        fun deleteTree(target: File): Boolean = runCatching {
            Files.walkFileTree(target.toPath(), object : SimpleFileVisitor<Path>() {
                override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                    Files.delete(file)
                    return FileVisitResult.CONTINUE
                }

                override fun postVisitDirectory(dir: Path, exc: IOException?): FileVisitResult {
                    exc?.let { throw it }
                    Files.delete(dir)
                    return FileVisitResult.CONTINUE
                }
            })
        }.isSuccess

        fun copyTree(from: File, to: File): Boolean = runCatching {
            val source = from.toPath()
            val destination = to.toPath()
            Files.walkFileTree(source, object : SimpleFileVisitor<Path>() {
                override fun preVisitDirectory(dir: Path, attrs: BasicFileAttributes): FileVisitResult {
                    Files.createDirectories(destination.resolve(source.relativize(dir).toString()))
                    return FileVisitResult.CONTINUE
                }

                override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                    if (attrs.isRegularFile) Files.copy(file, destination.resolve(source.relativize(file).toString()), StandardCopyOption.COPY_ATTRIBUTES)
                    return FileVisitResult.CONTINUE
                }
            })
        }.isSuccess
    }
}
