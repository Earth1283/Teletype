package io.github.Earth1283.teletype.auth

import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChallengeStoreTest {
    @Test
    fun `only the browser polling token can redeem an approved challenge`() = runBlocking {
        val store = ChallengeStore(ttlSeconds = { 60 })
        val challenge = assertNotNull(store.createChallenge("203.0.113.10"))
        assertEquals("203.0.113.10", store.verificationAddress(challenge.uuid))
        assertTrue(store.verify(challenge.uuid, "session"))
        assertFalse(store.verify(challenge.uuid, "second session"))
        assertNull(store.poll(challenge.uuid, challenge.uuid.toString()))
        assertEquals(ChallengeStore.PollResult.Verified("session"), store.poll(challenge.uuid, challenge.pollToken))
        assertNull(store.poll(challenge.uuid, challenge.pollToken))
    }

    @Test
    fun `concurrent polls can redeem a challenge only once`() = runBlocking {
        val store = ChallengeStore(ttlSeconds = { 60 })
        val challenge = assertNotNull(store.createChallenge("203.0.113.10"))
        val polls = List(2) {
            async(start = CoroutineStart.UNDISPATCHED) { store.poll(challenge.uuid, challenge.pollToken) }
        }

        assertTrue(store.verify(challenge.uuid, "session"))

        assertEquals(listOf(ChallengeStore.PollResult.Verified("session")), polls.mapNotNull { it.await() })
    }

    @Test
    fun `expired challenges cannot be approved or redeemed`() = runBlocking {
        var now = Instant.EPOCH
        val clock = object : Clock() {
            override fun instant(): Instant = now
            override fun getZone(): ZoneId = ZoneOffset.UTC
            override fun withZone(zone: ZoneId): Clock = this
        }
        val store = ChallengeStore(ttlSeconds = { 5 }, clock = clock)
        val pending = assertNotNull(store.createChallenge("203.0.113.10"))
        val approved = assertNotNull(store.createChallenge("203.0.113.10"))
        assertTrue(store.verify(approved.uuid, "session"))

        now = now.plusSeconds(5)

        assertNull(store.verificationAddress(pending.uuid))
        assertFalse(store.verify(pending.uuid, "session"))
        assertNull(store.poll(approved.uuid, approved.pollToken))
    }

    @Test
    fun `clearing challenges releases pending polls`() = runBlocking {
        val store = ChallengeStore(ttlSeconds = { 60 })
        val challenge = assertNotNull(store.createChallenge("203.0.113.10"))
        val poll = async(start = CoroutineStart.UNDISPATCHED) { store.poll(challenge.uuid, challenge.pollToken) }

        store.clear()

        assertNull(poll.await())
        assertFalse(store.verify(challenge.uuid, "session"))
    }
}
