package io.github.Earth1283.teletype.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class JwtServiceTest {
    @Test
    fun `issued tokens verify with the same secret`() {
        val service = JwtService("test-secret")

        val token = service.issueToken(subject = "console", expiryMinutes = 60)
        val decoded = service.verify(token)

        assertNotNull(decoded)
        assertEquals("teletype", decoded.issuer)
        assertEquals("console", decoded.subject)
    }

    @Test
    fun `tokens do not verify with a different secret`() {
        val token = JwtService("first-secret").issueToken(subject = "console")

        assertNull(JwtService("second-secret").verify(token))
    }

    @Test
    fun `expired tokens are rejected`() {
        val service = JwtService("test-secret")
        val token = service.issueToken(subject = "console", expiryMinutes = -1)

        assertNull(service.verify(token))
    }

    @Test
    fun `session tokens require an expiration and a named subject`() {
        val service = JwtService("test-secret")
        val algorithm = Algorithm.HMAC256("test-secret")
        val withIssuer = JWT.create().withIssuer(JwtService.ISSUER)

        assertNull(service.verify(withIssuer.withSubject("console").sign(algorithm)))
        assertNull(service.verify(withIssuer.withExpiresAt(Instant.now().plusSeconds(60)).withSubject(" ").sign(algorithm)))
    }

    @Test
    fun `malformed tokens are rejected`() {
        assertNull(JwtService("test-secret").verify("not-a-jwt"))
    }
}
