package io.github.Earth1283.teletype.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.interfaces.DecodedJWT
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date

class JwtService(secret: String) {
    private val algorithm = Algorithm.HMAC256(secret)
    private val verifier = JWT.require(algorithm).withIssuer("teletype").build()

    fun issueToken(subject: String = "admin", expiryHours: Long = 24): String =
        JWT.create()
            .withIssuer("teletype")
            .withSubject(subject)
            .withIssuedAt(Date())
            .withExpiresAt(Date.from(Instant.now().plus(expiryHours, ChronoUnit.HOURS)))
            .sign(algorithm)

    fun verify(token: String): DecodedJWT? = runCatching { verifier.verify(token) }.getOrNull()
}
