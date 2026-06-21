package io.github.Earth1283.teletype.standalone

import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.HttpHeaders
import io.ktor.serialization.kotlinx.json.json
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jline.reader.EndOfFileException
import org.jline.reader.LineReaderBuilder
import org.jline.reader.UserInterruptException
import org.jline.terminal.TerminalBuilder

@Serializable
private data class WsMsg(val type: String, val payload: String)

class TerminalClient(private val args: CliArgs) {
    private val configStore = ConfigStore()

    fun run() = runBlocking {
        val terminal = TerminalBuilder.builder().system(true).jansi(true).build()
        val reader = LineReaderBuilder.builder().terminal(terminal).build()

        terminal.writer().println("  Teletype — remote server console")
        terminal.writer().println()

        val host = args.host ?: configStore.host ?: promptFor(reader, "Server host: ")
        val port = args.port ?: configStore.port ?: promptFor(reader, "Port [8080]: ").toIntOrNull() ?: 8080

        val httpClient = HttpClient(CIO) {
            install(ContentNegotiation) { json() }
            install(WebSockets)
        }

        var token = args.token ?: configStore.token
        if (token == null) {
            token = AuthFlow(httpClient, terminal, reader).authenticate(host, port)
            configStore.save(host, port, token)
        }

        terminal.writer().println("  Connecting to ws://$host:$port/ws/console ...")
        terminal.writer().println("  Type a command and press Enter. Type 'exit' to quit.")
        terminal.writer().println()
        terminal.writer().flush()

        try {
            httpClient.webSocket(
                urlString = "ws://$host:$port/ws/console",
                request = { headers.append(HttpHeaders.Authorization, "Bearer $token") }
            ) {
                val printJob = launch {
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            val msg = runCatching {
                                Json.decodeFromString<WsMsg>(frame.readText())
                            }.getOrNull() ?: continue
                            if (msg.type == "log") {
                                terminal.writer().println(msg.payload)
                                terminal.writer().flush()
                            }
                        }
                    }
                }

                while (true) {
                    val line = withContext(Dispatchers.IO) {
                        runCatching { reader.readLine("> ") }.getOrNull()
                    } ?: break
                    if (line.equals("exit", ignoreCase = true)) break
                    if (line.isNotBlank()) {
                        send(Frame.Text(Json.encodeToString(WsMsg(type = "command", payload = line))))
                    }
                }
                printJob.cancel()
            }
        } catch (e: EndOfFileException) {
            // ctrl+D — normal exit
        } catch (e: UserInterruptException) {
            // ctrl+C — normal exit
        }

        httpClient.close()
        terminal.writer().println("\nDisconnected.")
        terminal.close()
    }

    private fun promptFor(reader: LineReaderBuilder, prompt: String): String {
        // Use a simple readLine here since we build the reader inline
        print(prompt)
        return readlnOrNull() ?: ""
    }

    private fun promptFor(reader: org.jline.reader.LineReader, prompt: String): String =
        runCatching { reader.readLine(prompt) }.getOrDefault("")
}
