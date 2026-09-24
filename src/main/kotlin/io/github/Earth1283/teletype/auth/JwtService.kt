package io.github.Earth1283.teletype.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.JWTVerifier
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.interfaces.DecodedJWT
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date

class JwtService(secret: String) {
    private val algorithm = Algorithm.HMAC256(secret)
    val verifier: JWTVerifier = JWT.require(algorithm).withIssuer(ISSUER).build()

    fun issueToken(subject: String, expiryMinutes: Long = 1440): String =
        JWT.create()
            .withIssuer(ISSUER)
            .withSubject(subject)
            .withIssuedAt(Date())
            .withExpiresAt(Date.from(Instant.now().plus(expiryMinutes, ChronoUnit.MINUTES)))
            .sign(algorithm)

    fun verify(token: String): DecodedJWT? = runCatching { verifier.verify(token) }.getOrNull()

    companion object {
        const val ISSUER = "teletype"
    }
}
