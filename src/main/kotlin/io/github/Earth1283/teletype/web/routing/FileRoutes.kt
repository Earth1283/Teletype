package io.github.Earth1283.teletype.web.routing

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.files.FetchGuard
import io.github.Earth1283.teletype.files.FileSandbox
import io.github.Earth1283.teletype.util.writeAtomic
import io.github.Earth1283.teletype.util.writeTextAtomic
import io.github.Earth1283.teletype.web.model.CopyRequest
import io.github.Earth1283.teletype.web.model.DecompressRequest
import io.github.Earth1283.teletype.web.model.DownloadTokenResponse
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
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.createRouteScopedPlugin
import io.ktor.server.request.receive
import io.ktor.server.request.receiveChannel
import io.ktor.server.request.receiveMultipart
import io.ktor.server.request.receiveText
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
import io.ktor.utils.io.jvm.javaio.toInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.zip.ZipFile
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

const val LAST_MODIFIED_HEADER = "X-Last-Modified"

private const val MAX_UPLOAD_CHUNKS = 100_000
private const val MAX_DECOMPRESS_ENTRIES = 100_000
private const val MAX_SEARCH_VISITED = 50_000
private const val MAX_SEARCH_RESULTS = 200
private const val STALE_UPLOAD_MS = 24 * 3_600_000L
private const val STALE_UPLOAD_SWEEP_INTERVAL_MS = 3_600_000L
private val UPLOAD_ID_PATTERN = Regex("[A-Za-z0-9._-]{8,120}")
private val uploadAssemblyLocks = ConcurrentHashMap<String, Any>()
private val lastStaleUploadSweep = AtomicLong(0)

fun Route.fileRoutes(plugin: Teletype) {
    val cfg = plugin.teletypeConfig

    install(createRouteScopedPlugin("TeletypeFilesGate") {
        onCall { call ->
            if (!cfg.filesEnabled) {
                call.respond(HttpStatusCode.Forbidden, ErrorResponse("File manager is disabled (files.enabled: false)"))
            }
        }
    }) {}

    val sandbox = FileSandbox(cfg.filesRoot)
    val chunkRoot = File(plugin.dataFolder, "upload-chunks").canonicalFile

    fun sandboxed(path: String, label: String = "Path"): File =
        sandbox.resolve(path) ?: forbidden("$label outside root")

    fun existingDir(path: String, label: String = "Directory"): File =
        sandboxed(path, label).takeIf { it.isDirectory } ?: notFound("$label not found")

    fun existingFile(path: String): File =
        sandboxed(path).takeIf { it.isFile } ?: notFound("File not found")

    fun notRoot(file: File, action: String): File =
        file.takeUnless(sandbox::isRoot) ?: forbidden("Refusing to $action the files root")

    fun ApplicationCall.pathQuery() = request.queryParameters["path"] ?: ""
    fun ApplicationCall.overwriteQuery() = request.queryParameters["overwrite"] == "true"

    fun requireEditable(file: File) {
        val allowedExts = cfg.filesEditableExtensions
        if (allowedExts.isNotEmpty() && file.extension.lowercase() !in allowedExts)
            throw ApiException(HttpStatusCode.UnsupportedMediaType, "Extension not allowed for editing")
    }

    fun maxEditBytes() = cfg.filesMaxEditSizeMb * 1024 * 1024L

    fun tooLargeForEditor(): Nothing =
        throw ApiException(HttpStatusCode.PayloadTooLarge, "File too large for editor (max ${cfg.filesMaxEditSizeMb} MB)")

    fun entryOf(file: File) = FileEntry(
        name = file.name,
        path = sandbox.relativePath(file),
        isDirectory = file.isDirectory,
        size = if (file.isFile) file.length() else 0L,
        lastModified = file.lastModified(),
    )

    get("/list") {
        val dir = existingDir(call.pathQuery())
        val entries = withContext(Dispatchers.IO) {
            dir.listFiles()
                ?.map(::entryOf)
                ?.sortedWith(compareByDescending<FileEntry> { it.isDirectory }.thenBy { it.name })
                .orEmpty()
        }
        call.respond(entries)
    }

    get("/read") {
        val file = existingFile(call.pathQuery())
        if (file.length() > maxEditBytes()) tooLargeForEditor()
        requireEditable(file)
        val content = withContext(Dispatchers.IO) { if (isBinary(file)) null else file.readText() }
            ?: throw ApiException(HttpStatusCode.UnsupportedMediaType, "Binary file cannot be opened in editor")

        call.response.header(LAST_MODIFIED_HEADER, file.lastModified().toString())
        call.respondText(content, ContentType.Text.Plain)
    }

    put("/write") {
        val path = call.pathQuery()
        val file = notRoot(sandboxed(path), "overwrite")
        if (file.isDirectory) badRequest("Path is a directory")
        requireEditable(file)

        val expectedLastModified = call.request.queryParameters["expectedLastModified"]?.toLongOrNull()
        if (expectedLastModified != null && file.exists() && file.lastModified() != expectedLastModified)
            conflict("File changed on disk since it was opened")

        val content = call.receiveText()
        if (content.toByteArray().size > maxEditBytes()) tooLargeForEditor()

        withContext(Dispatchers.IO) { file.writeTextAtomic(content) }
        call.response.header(LAST_MODIFIED_HEADER, file.lastModified().toString())
        call.respond(StatusResponse("saved"))
        auditAsync(plugin, "file_write", path)
    }

    get("/download") {
        val file = existingFile(call.pathQuery())
        call.response.header(
            HttpHeaders.ContentDisposition,
            ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, file.name).toString()
        )
        call.respondFile(file)
    }

    post("/download-token") {
        val path = call.pathQuery()
        val file = existingFile(path)
        val token = plugin.webServer.downloadTokens.issue(file)
        call.respond(DownloadTokenResponse(token, "/api/download/$token"))
        auditAsync(plugin, "file_download", path)
    }

    post("/upload") {
        val dirPath = call.pathQuery()
        val dir = existingDir(dirPath)
        val overwrite = call.overwriteQuery()

        val uploaded = mutableListOf<String>()
        val skipped = mutableListOf<String>()
        call.receiveMultipart().forEachPart { part ->
            if (part is PartData.FileItem) {
                val dest = sandbox.resolveChild(dir, part.originalFileName ?: "upload")
                when {
                    dest == null -> skipped += part.originalFileName.orEmpty()
                    dest.exists() && !overwrite -> skipped += dest.name
                    else -> {
                        withContext(Dispatchers.IO) {
                            dest.writeAtomic { tmp ->
                                part.provider().toInputStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
                            }
                        }
                        uploaded += dest.name
                    }
                }
            }
            part.dispose()
        }

        if (uploaded.isEmpty() && skipped.isNotEmpty()) conflict("Already exists or invalid name: ${skipped.joinToString()}")
        val skippedNote = if (skipped.isEmpty()) "" else "; skipped ${skipped.joinToString()}"
        call.respond(StatusResponse("uploaded ${uploaded.size} file(s)$skippedNote"))
        auditAsync(plugin, "file_upload", "${uploaded.joinToString()} to $dirPath")
    }

    post("/upload-chunk") {
        val dirPath = call.pathQuery()
        val dir = existingDir(dirPath)
        sweepStaleUploads(chunkRoot)

        val params = call.request.queryParameters
        val uploadId = params["uploadId"]?.takeIf { it.matches(UPLOAD_ID_PATTERN) } ?: badRequest("Invalid upload id")
        val filename = params["filename"] ?: badRequest("Missing filename")
        val chunkIndex = params["chunkIndex"]?.toIntOrNull() ?: badRequest("Invalid chunk index")
        val totalChunks = params["totalChunks"]?.toIntOrNull() ?: badRequest("Invalid total chunks")
        val totalSize = params["totalSize"]?.toLongOrNull() ?: badRequest("Invalid total size")

        if (totalChunks !in 1..MAX_UPLOAD_CHUNKS || chunkIndex !in 0 until totalChunks || totalSize < 0)
            badRequest("Invalid chunk metadata")

        val dest = sandbox.resolveChild(dir, filename) ?: badRequest("Invalid filename")
        if (dest.exists() && !call.overwriteQuery()) conflict("${dest.name} already exists")
        val uploadDir = File(chunkRoot, uploadId).canonicalFile
        if (uploadDir.parentFile?.path != chunkRoot.path) badRequest("Invalid upload id")

        val lockKey = uploadLockKey(uploadId, dir, dest)
        val lock = uploadAssemblyLocks.computeIfAbsent(lockKey) { Any() }
        val partFile = File(uploadDir, "$chunkIndex.part")

        withContext(Dispatchers.IO) {
            uploadDir.mkdirs()
            partFile.writeAtomic { tmp ->
                call.receiveChannel().toInputStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
            }
        }

        val outcome = try {
            withContext(Dispatchers.IO) { synchronized(lock) { assembleIfComplete(uploadDir, totalChunks, totalSize, dest) } }
        } finally {
            if (!uploadDir.exists()) uploadAssemblyLocks.remove(lockKey, lock)
        }

        when (outcome) {
            is ChunkOutcome.SizeMismatch -> badRequest("Chunk size mismatch: expected $totalSize bytes, received ${outcome.received}")
            is ChunkOutcome.Assembled -> {
                call.respond(StatusResponse("uploaded ${dest.name} (${outcome.size} bytes)"))
                auditAsync(plugin, "file_upload", "${dest.name} to $dirPath")
            }
            ChunkOutcome.Pending -> call.respond(StatusResponse("chunk ${chunkIndex + 1}/$totalChunks received"))
        }
    }

    delete("") {
        val path = call.pathQuery()
        val file = notRoot(sandboxed(path), "delete")
        if (!file.exists()) notFound()

        val deleted = withContext(Dispatchers.IO) {
            if (file.isDirectory) file.deleteRecursively() else file.delete()
        }
        if (!deleted) throw ApiException(HttpStatusCode.InternalServerError, "Delete failed")
        call.respond(StatusResponse("deleted"))
        auditAsync(plugin, "file_delete", path)
    }

    post("/mkdir") {
        val path = call.pathQuery()
        val dir = sandboxed(path)
        if (dir.exists()) conflict("Already exists")
        if (!withContext(Dispatchers.IO) { dir.mkdirs() })
            throw ApiException(HttpStatusCode.InternalServerError, "Failed to create directory")
        call.respond(StatusResponse("created"))
        auditAsync(plugin, "file_mkdir", path)
    }

    patch("/rename") {
        val req = call.receive<RenameRequest>()
        val from = notRoot(sandboxed(req.from, "Source path"), "rename")
        val to = notRoot(sandboxed(req.to, "Destination path"), "replace")
        if (!from.exists()) notFound("Source not found")
        if (to.exists()) conflict("Destination already exists")

        val moved = withContext(Dispatchers.IO) {
            to.parentFile?.mkdirs()
            from.renameTo(to)
        }
        if (!moved) throw ApiException(HttpStatusCode.InternalServerError, "Rename failed")
        call.respond(StatusResponse("moved"))
        auditAsync(plugin, "file_rename", "${req.from} → ${req.to}")
    }

    post("/copy") {
        val req = call.receive<CopyRequest>()
        val from = sandboxed(req.from, "Source path")
        val to = sandboxed(req.to, "Destination path")
        if (!from.exists()) notFound("Source not found")
        if (to.exists()) conflict("Destination already exists")
        if (from.isDirectory && FileSandbox(from).contains(to)) badRequest("Cannot copy a folder into itself")

        val copied = withContext(Dispatchers.IO) {
            runCatching {
                to.parentFile?.mkdirs()
                if (from.isDirectory) from.copyRecursively(to, overwrite = false)
                else from.copyTo(to, overwrite = false).exists()
            }.getOrDefault(false)
        }
        if (!copied) throw ApiException(HttpStatusCode.InternalServerError, "Copy failed")
        call.respond(StatusResponse("copied"))
        auditAsync(plugin, "file_copy", "${req.from} → ${req.to}")
    }

    get("/search") {
        val q = call.request.queryParameters["q"] ?: ""
        val scope = call.request.queryParameters["scope"] ?: "local"
        val fuzzyLevel = call.request.queryParameters["fuzzyLevel"]?.toIntOrNull()?.coerceIn(0, 100) ?: 0
        if (q.isBlank()) return@get call.respond(emptyList<FileEntry>())

        val searchRoot = if (scope == "global") sandbox.root else sandbox.resolve(call.pathQuery()) ?: sandbox.root
        val results = withContext(Dispatchers.IO) {
            sandbox.walkWithoutFollowingLinks(searchRoot, MAX_SEARCH_VISITED)
                .filter { fileMatchesQuery(it.name, q, fuzzyLevel) }
                .take(MAX_SEARCH_RESULTS)
                .map(::entryOf)
                .toList()
        }
        call.respond(results)
    }

    post("/fetch") {
        val req = call.receive<FetchRequest>()
        val dir = existingDir(req.destPath, "Destination directory")
        val url = runCatching { FetchGuard.parse(req.url) }.getOrElse { badRequest(it.message ?: "Invalid URL") }

        val derivedName = req.fileName?.takeIf { it.isNotBlank() }
            ?: url.path.substringAfterLast('/').takeIf { it.isNotBlank() }
            ?: "download"
        val dest = sandbox.resolveChild(dir, derivedName) ?: badRequest("Invalid filename")
        if (dest.exists()) conflict("${dest.name} already exists")

        val maxBytes = cfg.filesMaxFetchSizeMb * 1024L * 1024L
        val size = withContext(Dispatchers.IO) {
            try {
                var written = 0L
                dest.writeAtomic { tmp -> tmp.outputStream().use { written = FetchGuard.download(url, it, maxBytes) } }
                written
            } catch (e: FetchGuard.FetchException) {
                badRequest(e.message ?: "Fetch failed")
            } catch (e: IOException) {
                throw ApiException(HttpStatusCode.BadGateway, "Fetch failed: ${e.message ?: e::class.simpleName}")
            }
        }

        call.respond(StatusResponse("fetched ${dest.name} ($size bytes)"))
        auditAsync(plugin, "file_fetch", "${req.url} → ${sandbox.relativePath(dest)}")
    }

    post("/decompress") {
        val req = call.receive<DecompressRequest>()
        val archive = existingFile(req.path)
        val destDir = sandboxed(req.destPath, "Destination path")
        if (destDir.exists() && !destDir.isDirectory) badRequest("Destination is not a folder")

        val lowerName = archive.name.lowercase()
        val isZip = lowerName.endsWith(".zip")
        val isTarGz = lowerName.endsWith(".tar.gz") || lowerName.endsWith(".tgz")
        if (!isZip && !isTarGz) badRequest("Unsupported archive type (only .zip and .tar.gz/.tgz are supported)")

        val destDirExisted = destDir.exists()
        val extractor = ArchiveExtractor(destDir, cfg.filesMaxDecompressSizeMb)
        val result = withContext(Dispatchers.IO) {
            runCatching { if (isZip) extractor.extractZip(archive) else extractor.extractTarGz(archive) }
        }

        result.onFailure { e ->
            if (!destDirExisted) destDir.deleteRecursively()
            badRequest(e.message ?: "Decompression failed")
        }
        call.respond(StatusResponse("decompressed"))
        auditAsync(plugin, "file_decompress", "${req.path} → ${req.destPath}")
    }
}

private sealed interface ChunkOutcome {
    data object Pending : ChunkOutcome
    data class Assembled(val size: Long) : ChunkOutcome
    data class SizeMismatch(val received: Long) : ChunkOutcome
}

private fun uploadLockKey(uploadId: String, dir: File, dest: File) = "$uploadId/${dir.path}/${dest.name}"

private fun assembleIfComplete(uploadDir: File, totalChunks: Int, totalSize: Long, dest: File): ChunkOutcome {
    val parts = (0 until totalChunks).map { File(uploadDir, "$it.part") }
    if (!parts.all { it.exists() }) return ChunkOutcome.Pending

    val assembledSize = parts.sumOf { it.length() }
    if (assembledSize != totalSize) {
        uploadDir.deleteRecursively()
        return ChunkOutcome.SizeMismatch(assembledSize)
    }
    dest.writeAtomic { tmp ->
        tmp.outputStream().use { output -> parts.forEach { part -> part.inputStream().use { it.copyTo(output) } } }
    }
    uploadDir.deleteRecursively()
    return ChunkOutcome.Assembled(assembledSize)
}

private fun sweepStaleUploads(chunkRoot: File) {
    val now = System.currentTimeMillis()
    val last = lastStaleUploadSweep.get()
    if (now - last < STALE_UPLOAD_SWEEP_INTERVAL_MS || !lastStaleUploadSweep.compareAndSet(last, now)) return

    chunkRoot.listFiles()
        ?.filter { it.isDirectory && now - it.lastModified() > STALE_UPLOAD_MS }
        ?.forEach { stale ->
            stale.deleteRecursively()
            uploadAssemblyLocks.keys.removeIf { it.startsWith("${stale.name}/") }
        }
}

private class ArchiveExtractor(destDir: File, private val maxSizeMb: Int) {
    private val destRoot = destDir.apply { mkdirs() }.canonicalFile
    private val destSandbox = FileSandbox(destRoot)
    private val maxBytes = maxSizeMb * 1024 * 1024L
    private var totalBytes = 0L
    private var entryCount = 0

    fun extractZip(archive: File) {
        ZipFile.builder().setFile(archive).get().use { zf ->
            for (entry in zf.entries) {
                val isReadableFile = !entry.isDirectory && zf.canReadEntryData(entry)
                if (entry.isUnixSymlink || !(entry.isDirectory || isReadableFile)) continue
                extractEntry(entry.name, entry.isDirectory) { zf.getInputStream(entry) }
            }
        }
    }

    fun extractTarGz(archive: File) {
        GzipCompressorInputStream(archive.inputStream()).use { gz ->
            TarArchiveInputStream(gz).use { tis ->
                generateSequence { tis.nextEntry }.forEach { entry ->
                    if (entry.isDirectory || (entry.isFile && tis.canReadEntryData(entry)))
                        extractEntry(entry.name, entry.isDirectory) { tis }
                }
            }
        }
    }

    private fun extractEntry(name: String, isDirectory: Boolean, input: () -> InputStream) {
        if (++entryCount > MAX_DECOMPRESS_ENTRIES)
            throw IOException("Archive has too many entries (max $MAX_DECOMPRESS_ENTRIES)")
        val target = File(destRoot, name).canonicalFile
        if (!destSandbox.contains(target)) throw IOException("Archive entry escapes destination folder: $name")

        if (isDirectory) {
            target.mkdirs()
            return
        }
        target.parentFile?.mkdirs()
        target.outputStream().use { out -> copyWithinBudget(input(), out) }
    }

    private fun copyWithinBudget(input: InputStream, out: java.io.OutputStream) {
        val buf = ByteArray(8192)
        while (true) {
            val n = input.read(buf)
            if (n == -1) return
            totalBytes += n
            if (totalBytes > maxBytes) throw IOException("Archive exceeds maximum decompressed size ($maxSizeMb MB)")
            out.write(buf, 0, n)
        }
    }
}

private fun fileMatchesQuery(name: String, q: String, fuzzyLevel: Int): Boolean {
    val nameLower = name.lowercase()
    val qLower = q.lowercase()
    if (fuzzyLevel < 50) return nameLower.contains(qLower)
    var qi = 0
    for (c in nameLower) if (qi < qLower.length && c == qLower[qi]) qi++
    return qi == qLower.length
}

private val BINARY_EXTENSIONS = setOf(
    "jar", "class", "zip", "gz", "tar", "7z", "rar",
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp",
    "mp3", "ogg", "wav", "mp4", "avi", "mkv",
    "pdf", "doc", "docx", "xls", "xlsx",
    "exe", "dll", "so", "dylib", "bin"
)

private fun isBinary(file: File): Boolean {
    if (file.extension.lowercase() in BINARY_EXTENSIONS) return true
    val buf = ByteArray(8192)
    val read = file.inputStream().use { it.read(buf) }
    return (0 until read).any { buf[it] == 0.toByte() }
}
