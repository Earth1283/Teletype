package io.github.Earth1283.teletype.util

import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

fun File.writeTextAtomic(text: String) = writeAtomic { it.writeText(text) }

inline fun File.writeAtomic(write: (File) -> Unit) {
    val dir = absoluteFile.parentFile.apply { mkdirs() }
    val tmp = File.createTempFile(".$name.", ".tmp", dir)
    try {
        write(tmp)
        copyPermissionsTo(tmp)
        tmp.moveOnto(this)
    } finally {
        tmp.delete()
    }
}

@PublishedApi
internal fun File.copyPermissionsTo(other: File) {
    if (!exists()) return
    runCatching { Files.setPosixFilePermissions(other.toPath(), Files.getPosixFilePermissions(toPath())) }
}

fun File.moveOnto(target: File) {
    try {
        Files.move(toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    } catch (_: AtomicMoveNotSupportedException) {
        Files.move(toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
    }
}

fun File.quarantineCorrupt(): File? {
    val dest = File(parentFile, "$name.corrupt-${System.currentTimeMillis()}")
    return if (exists() && renameTo(dest)) dest else null
}
