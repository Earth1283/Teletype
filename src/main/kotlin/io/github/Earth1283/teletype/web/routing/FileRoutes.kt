package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.CopyRequest
import io.github.Earth1283.teletype.web.model.ErrorResponse
import io.github.Earth1283.teletype.web.model.FetchRequest
import io.github.Earth1283.teletype.web.model.FileEntry
import io.github.Earth1283.teletype.web.model.RenameRequest
import io.github.Earth1283.teletype.web.model.StatusResponse
import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.utils.io.jvm.javaio.toInputStream
import io.ktor.server.request.receive
import io.ktor.server.request.receiveChannel
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ConcurrentHashMap

private const val MAX_UPLOAD_CHUNKS = 100_000
private val uploadAssemblyLocks = ConcurrentHashMap<String, Any>()
private val UPLOAD_ID_PATTERN = Regex("[A-Za-z0-9._-]{8,120}")

fun Route.fileRoutes(plugin: Teletype) {
    val cfg = plugin.teletypeConfig
    val root = cfg.filesRoot.canonicalFile
    val rootPath = root.path
    val chunkRoot = File(plugin.dataFolder, "upload-chunks").canonicalFile

    fun resolve(path: String): File? {
        val resolved = File(root, path).canonicalFile
        return if (resolved.path == rootPath || resolved.path.startsWith(rootPath + File.separator)) resolved else null
    }

    fun resolveUploadDestination(dir: File, filename: String): File? {
        val cleanName = File(filename).name.takeIf { it.isNotBlank() } ?: return null
        val dest = File(dir, cleanName).canonicalFile
        val dirPath = dir.canonicalFile.path
        return if (dest.parentFile?.path == dirPath) dest else null
    }

    get("/list") {
        val path = call.request.queryParameters["path"] ?: ""
        val dir = resolve(path)
            ?: return@get call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!dir.exists() || !dir.isDirectory)
            return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Directory not found"))

        val entries = withContext(Dispatchers.IO) {
            dir.listFiles()?.map {
                FileEntry(
                    name = it.name,
                    path = it.relativeTo(root).path,
                    isDirectory = it.isDirectory,
                    size = if (it.isFile) it.length() else 0L,
                    lastModified = it.lastModified()
                )
            }?.sortedWith(compareByDescending<FileEntry> { it.isDirectory }.thenBy { it.name })
                ?: emptyList()
        }

        call.respond(entries)
    }

    get("/read") {
        val path = call.request.queryParameters["path"] ?: ""
        val file = resolve(path)
            ?: return@get call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!file.exists() || !file.isFile)
            return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("File not found"))
        val maxBytes = cfg.filesMaxEditSizeMb * 1024 * 1024L
        if (file.length() > maxBytes)
            return@get call.respond(HttpStatusCode.PayloadTooLarge, ErrorResponse("File too large for editor (max ${cfg.filesMaxEditSizeMb} MB)"))
        val allowedExts = cfg.filesEditableExtensions
        if (allowedExts.isNotEmpty() && file.extension.lowercase() !in allowedExts)
            return@get call.respond(HttpStatusCode.UnsupportedMediaType, ErrorResponse("Extension not allowed for editing"))
        val content = withContext(Dispatchers.IO) {
            if (isBinary(file)) null else file.readText()
        }
        if (content == null)
            return@get call.respond(HttpStatusCode.UnsupportedMediaType, ErrorResponse("Binary file cannot be opened in editor"))

        call.respondText(content, ContentType.Text.Plain)
    }

    put("/write") {
        val path = call.request.queryParameters["path"] ?: ""
        val file = resolve(path)
            ?: return@put call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (file.isDirectory)
            return@put call.respond(HttpStatusCode.BadRequest, ErrorResponse("Path is a directory"))

        val content = call.receive<String>()
        withContext(Dispatchers.IO) {
            file.parentFile?.mkdirs()
            file.writeText(content)
        }
        call.respond(StatusResponse("saved"))
        auditAsync(plugin, "file_write", path)
    }

    get("/download") {
        val path = call.request.queryParameters["path"] ?: ""
        val file = resolve(path)
            ?: return@get call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!file.exists() || !file.isFile)
            return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("File not found"))

        call.response.header(
            HttpHeaders.ContentDisposition,
            ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, file.name).toString()
        )
        call.respondFile(file)
    }

    post("/upload") {
        val dirPath = call.request.queryParameters["path"] ?: ""
        val dir = resolve(dirPath)
            ?: return@post call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!dir.exists() || !dir.isDirectory)
            return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("Directory not found"))

        val multipart = call.receiveMultipart()
        var count = 0
        multipart.forEachPart { part ->
            if (part is PartData.FileItem) {
                val filename = part.originalFileName?.let { File(it).name } ?: "upload"
                val dest = File(dir, filename)
                withContext(Dispatchers.IO) {
                    part.provider().toInputStream().use { input -> dest.outputStream().use { input.copyTo(it) } }
                }
                count++
            }
            part.dispose()
        }
        call.respond(StatusResponse("uploaded $count file(s)"))
        auditAsync(plugin, "file_upload", "$count file(s) to $dirPath")
    }

    post("/upload-chunk") {
        val dirPath = call.request.queryParameters["path"] ?: ""
        val dir = resolve(dirPath)
            ?: return@post call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!dir.exists() || !dir.isDirectory)
            return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("Directory not found"))

        val params = call.request.queryParameters
        val uploadId = params["uploadId"]?.takeIf { it.matches(UPLOAD_ID_PATTERN) }
            ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid upload id"))
        val filename = params["filename"] ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing filename"))
        val chunkIndex = params["chunkIndex"]?.toIntOrNull()
            ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid chunk index"))
        val totalChunks = params["totalChunks"]?.toIntOrNull()
            ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid total chunks"))
        val totalSize = params["totalSize"]?.toLongOrNull()
            ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid total size"))

        if (totalChunks !in 1..MAX_UPLOAD_CHUNKS || chunkIndex !in 0 until totalChunks || totalSize < 0)
            return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid chunk metadata"))

        val dest = resolveUploadDestination(dir, filename)
            ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid filename"))
        val uploadDir = File(chunkRoot, uploadId).canonicalFile
        if (uploadDir.parentFile?.path != chunkRoot.path)
            return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid upload id"))

        val lockKey = "${dir.canonicalPath}/$uploadId/${dest.name}"
        val lock = uploadAssemblyLocks.computeIfAbsent(lockKey) { Any() }
        val partFile = File(uploadDir, "$chunkIndex.part")
        val tmpPartFile = File(uploadDir, "$chunkIndex.part.tmp-${System.nanoTime()}")

        withContext(Dispatchers.IO) {
            uploadDir.mkdirs()
            call.receiveChannel().toInputStream().use { input ->
                tmpPartFile.outputStream().use { output -> input.copyTo(output) }
            }
        }

        var completed = false
        var assembledSize = 0L
        var sizeMismatch = false
        try {
            withContext(Dispatchers.IO) {
                synchronized(lock) {
                    partFile.delete()
                    if (!tmpPartFile.renameTo(partFile)) {
                        tmpPartFile.inputStream().use { input ->
                            partFile.outputStream().use { output -> input.copyTo(output) }
                        }
                        tmpPartFile.delete()
                    }

                    val parts = (0 until totalChunks).map { File(uploadDir, "$it.part") }
                    if (parts.all { it.exists() }) {
                        assembledSize = parts.sumOf { it.length() }
                        if (assembledSize != totalSize) {
                            uploadDir.deleteRecursively()
                            sizeMismatch = true
                            return@synchronized
                        }
                        dest.parentFile?.mkdirs()
                        dest.outputStream().use { output ->
                            parts.forEach { part -> part.inputStream().use { input -> input.copyTo(output) } }
                        }
                        uploadDir.deleteRecursively()
                        completed = true
                    }
                }
            }
        } finally {
            if (completed || !uploadDir.exists()) uploadAssemblyLocks.remove(lockKey, lock)
        }

        if (sizeMismatch) {
            call.respond(
                HttpStatusCode.BadRequest,
                ErrorResponse("Chunk size mismatch: expected $totalSize bytes, received $assembledSize")
            )
        } else if (completed) {
            call.respond(StatusResponse("uploaded ${dest.name} ($assembledSize bytes)"))
            auditAsync(plugin, "file_upload", "${dest.name} to $dirPath")
        } else {
            call.respond(StatusResponse("chunk ${chunkIndex + 1}/$totalChunks received"))
        }
    }

    delete("") {
        val path = call.request.queryParameters["path"] ?: ""
        val file = resolve(path)
            ?: return@delete call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!file.exists())
            return@delete call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))

        val deleted = withContext(Dispatchers.IO) {
            if (file.isDirectory) file.deleteRecursively() else file.delete()
        }
        if (deleted) {
            call.respond(StatusResponse("deleted"))
            auditAsync(plugin, "file_delete", path)
        } else call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Delete failed"))
    }

    post("/mkdir") {
        val path = call.request.queryParameters["path"] ?: ""
        val dir = resolve(path)
            ?: return@post call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (dir.exists())
            return@post call.respond(HttpStatusCode.Conflict, ErrorResponse("Already exists"))

        if (withContext(Dispatchers.IO) { dir.mkdirs() }) call.respond(StatusResponse("created"))
        else call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Failed to create directory"))
    }

    patch("/rename") {
        val req = call.receive<RenameRequest>()
        val from = resolve(req.from)
            ?: return@patch call.respond(HttpStatusCode.Forbidden, ErrorResponse("Source path outside root"))
        val to = resolve(req.to)
            ?: return@patch call.respond(HttpStatusCode.Forbidden, ErrorResponse("Destination path outside root"))

        if (!from.exists())
            return@patch call.respond(HttpStatusCode.NotFound, ErrorResponse("Source not found"))
        if (to.exists())
            return@patch call.respond(HttpStatusCode.Conflict, ErrorResponse("Destination already exists"))

        val moved = withContext(Dispatchers.IO) {
            to.parentFile?.mkdirs()
            from.renameTo(to)
        }
        if (moved) {
            call.respond(StatusResponse("moved"))
            auditAsync(plugin, "file_rename", "${req.from} → ${req.to}")
        } else call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Rename failed"))
    }

    post("/copy") {
        val req = call.receive<CopyRequest>()
        val from = resolve(req.from)
            ?: return@post call.respond(HttpStatusCode.Forbidden, ErrorResponse("Source path outside root"))
        val to = resolve(req.to)
            ?: return@post call.respond(HttpStatusCode.Forbidden, ErrorResponse("Destination path outside root"))

        if (!from.exists())
            return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("Source not found"))
        if (to.exists())
            return@post call.respond(HttpStatusCode.Conflict, ErrorResponse("Destination already exists"))

        val fromPath = from.canonicalFile.path
        val toPath = to.canonicalFile.path
        if (from.isDirectory && (toPath == fromPath || toPath.startsWith(fromPath + File.separator)))
            return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Cannot copy a folder into itself"))

        val copied = withContext(Dispatchers.IO) {
            runCatching {
                to.parentFile?.mkdirs()
                if (from.isDirectory) from.copyRecursively(to, overwrite = false)
                else {
                    from.copyTo(to, overwrite = false)
                    true
                }
            }.getOrDefault(false)
        }

        if (copied) {
            call.respond(StatusResponse("copied"))
            auditAsync(plugin, "file_copy", "${req.from} → ${req.to}")
        } else call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Copy failed"))
    }

    get("/search") {
        val q = call.request.queryParameters["q"] ?: ""
        val scope = call.request.queryParameters["scope"] ?: "local"
        val path = call.request.queryParameters["path"] ?: ""
        val fuzzyLevel = call.request.queryParameters["fuzzyLevel"]?.toIntOrNull()?.coerceIn(0, 100) ?: 0

        if (q.isBlank()) return@get call.respond(emptyList<FileEntry>())

        val searchRoot = if (scope == "global") root else (resolve(path) ?: root)

        val results = withContext(Dispatchers.IO) {
            searchRoot.walkTopDown()
                .filter { it != searchRoot }
                .filter { fileMatchesQuery(it.name, q, fuzzyLevel) }
                .take(200)
                .map { file ->
                    FileEntry(
                        name = file.name,
                        path = file.relativeTo(root).path,
                        isDirectory = file.isDirectory,
                        size = if (file.isFile) file.length() else 0L,
                        lastModified = file.lastModified()
                    )
                }
                .toList()
        }

        call.respond(results)
    }

    post("/fetch") {
        val req = call.receive<FetchRequest>()
        val dir = resolve(req.destPath)
            ?: return@post call.respond(HttpStatusCode.Forbidden, ErrorResponse("Destination path outside root"))
        if (!dir.exists() || !dir.isDirectory)
            return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("Destination directory not found"))

        val url = runCatching { java.net.URI(req.url).toURL() }.getOrNull()
            ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid URL"))

        val derivedName = req.fileName?.takeIf { it.isNotBlank() }
            ?: url.path.substringAfterLast('/').takeIf { it.isNotBlank() }
            ?: "download"
        val dest = File(dir, derivedName)

        withContext(Dispatchers.IO) {
            url.openStream().use { input -> dest.outputStream().use { input.copyTo(it) } }
        }

        call.respond(StatusResponse("fetched ${dest.name} (${dest.length()} bytes)"))
    }
}

private fun fileMatchesQuery(name: String, q: String, fuzzyLevel: Int): Boolean {
    val nameLower = name.lowercase()
    val qLower = q.lowercase()
    return if (fuzzyLevel < 50) {
        nameLower.contains(qLower)
    } else {
        var qi = 0
        for (c in nameLower) { if (qi < qLower.length && c == qLower[qi]) qi++ }
        qi == qLower.length
    }
}

private val BINARY_EXTENSIONS = setOf(
    "jar", "class", "zip", "gz", "tar", "7z", "rar",
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp",
    "mp3", "ogg", "wav", "mp4", "avi", "mkv",
    "pdf", "doc", "docx", "xls", "xlsx",
    "exe", "dll", "so", "dylib", "bin"
)

private fun isBinary(file: File): Boolean {
    val ext = file.extension.lowercase()
    if (ext in BINARY_EXTENSIONS) return true
    // Sniff first 8KB for null bytes
    val buf = ByteArray(8192)
    val read = file.inputStream().use { it.read(buf) }
    return (0 until read).any { buf[it] == 0.toByte() }
}
