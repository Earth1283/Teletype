package io.github.Earth1283.teletype.multiplex

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProxyRateLimiterTest {
    private val limiter = ProxyRateLimiter()

    @AfterTest
    fun tearDown() {
        limiter.shutdown()
    }

    @Test
    fun `allows requests up to the per route ip limit`() {
        assertTrue(limiter.allow("route-a", "192.0.2.1", limitPerMinute = 2))
        assertTrue(limiter.allow("route-a", "192.0.2.1", limitPerMinute = 2))
        assertFalse(limiter.allow("route-a", "192.0.2.1", limitPerMinute = 2))
    }

    @Test
    fun `tracks route and ip counters independently`() {
        assertTrue(limiter.allow("route-a", "192.0.2.1", limitPerMinute = 1))
        assertFalse(limiter.allow("route-a", "192.0.2.1", limitPerMinute = 1))

        assertTrue(limiter.allow("route-a", "192.0.2.2", limitPerMinute = 1))
        assertTrue(limiter.allow("route-b", "192.0.2.1", limitPerMinute = 1))
    }
}
