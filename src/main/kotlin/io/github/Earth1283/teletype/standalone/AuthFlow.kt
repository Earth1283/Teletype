package io.github.Earth1283.teletype.standalone

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import kotlinx.serialization.Serializable
import org.jline.reader.LineReader
import org.jline.terminal.Terminal

@Serializable
private data class ChallengeResp(val uuid: String, val message: String)

@Serializable
private data class PollResp(val status: String, val token: String? = null)

class AuthFlow(
    private val client: HttpClient,
    private val terminal: Terminal,
    private val reader: LineReader
) {
    suspend fun authenticate(host: String, port: Int): String {
        val baseUrl = "http://$host:$port"
        val challenge: ChallengeResp = client.post("$baseUrl/api/auth/challenge").body()

        terminal.writer().println()
        terminal.writer().println("  ${challenge.message}")
        terminal.writer().println()
        terminal.writer().println("  Waiting for console verification (10 minute timeout)...")
        terminal.writer().flush()

        // Long-poll up to 20 times (20 × 30s = 10 minutes)
        repeat(20) {
            val poll: PollResp = client.get("$baseUrl/api/auth/poll/${challenge.uuid}").body()
            if (poll.status == "verified" && poll.token != null) {
                terminal.writer().println("  Authenticated!")
                terminal.writer().flush()
                return poll.token
            }
        }
        error("Authentication timed out after 10 minutes")
    }
}
