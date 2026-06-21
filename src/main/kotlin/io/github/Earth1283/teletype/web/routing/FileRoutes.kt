package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
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
import java.io.File

private const val MAX_TEXT_SIZE = 2 * 1024 * 1024L // 2 MB

fun Route.fileRoutes(plugin: Teletype) {
    val root = plugin.teletypeConfig.filesRoot

    fun resolve(path: String): File? {
        val resolved = File(root, path).canonicalFile
        return if (resolved.path.startsWith(root.canonicalPath)) resolved else null
    }

    get("/list") {
        val path = call.request.queryParameters["path"] ?: ""
        val dir = resolve(path)
            ?: return@get call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!dir.exists() || !dir.isDirectory)
            return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Directory not found"))

        val entries = dir.listFiles()?.map {
            FileEntry(
                name = it.name,
                path = it.relativeTo(root).path,
                isDirectory = it.isDirectory,
                size = if (it.isFile) it.length() else 0L,
                lastModified = it.lastModified()
            )
        }?.sortedWith(compareByDescending<FileEntry> { it.isDirectory }.thenBy { it.name })
            ?: emptyList()

        call.respond(entries)
    }

    get("/read") {
        val path = call.request.queryParameters["path"] ?: ""
        val file = resolve(path)
            ?: return@get call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!file.exists() || !file.isFile)
            return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("File not found"))
        if (file.length() > MAX_TEXT_SIZE)
            return@get call.respond(HttpStatusCode.PayloadTooLarge, ErrorResponse("File too large for editor (max 2 MB)"))
        if (isBinary(file))
            return@get call.respond(HttpStatusCode.UnsupportedMediaType, ErrorResponse("Binary file cannot be opened in editor"))

        call.respondText(file.readText(), ContentType.Text.Plain)
    }

    put("/write") {
        val path = call.request.queryParameters["path"] ?: ""
        val file = resolve(path)
            ?: return@put call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (file.isDirectory)
            return@put call.respond(HttpStatusCode.BadRequest, ErrorResponse("Path is a directory"))

        val content = call.receive<String>()
        file.parentFile?.mkdirs()
        file.writeText(content)
        call.respond(StatusResponse("saved"))
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
                part.provider().toInputStream().use { input -> dest.outputStream().use { input.copyTo(it) } }
                count++
            }
            part.dispose()
        }
        call.respond(StatusResponse("uploaded $count file(s)"))
    }

    delete("") {
        val path = call.request.queryParameters["path"] ?: ""
        val file = resolve(path)
            ?: return@delete call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (!file.exists())
            return@delete call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))

        val deleted = if (file.isDirectory) file.deleteRecursively() else file.delete()
        if (deleted) call.respond(StatusResponse("deleted"))
        else call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Delete failed"))
    }

    post("/mkdir") {
        val path = call.request.queryParameters["path"] ?: ""
        val dir = resolve(path)
            ?: return@post call.respond(HttpStatusCode.Forbidden, ErrorResponse("Path outside root"))
        if (dir.exists())
            return@post call.respond(HttpStatusCode.Conflict, ErrorResponse("Already exists"))

        if (dir.mkdirs()) call.respond(StatusResponse("created"))
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

        to.parentFile?.mkdirs()
        if (from.renameTo(to)) call.respond(StatusResponse("moved"))
        else call.respond(HttpStatusCode.InternalServerError, ErrorResponse("Rename failed"))
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

        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            url.openStream().use { input -> dest.outputStream().use { input.copyTo(it) } }
        }

        call.respond(StatusResponse("fetched ${dest.name} (${dest.length()} bytes)"))
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
