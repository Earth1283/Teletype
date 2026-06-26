package io.github.Earth1283.teletype.actions

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import java.time.ZoneOffset
import java.time.ZonedDateTime

class CronParserTest {
    @Test
    fun `validates supported cron field forms`() {
        assertTrue(CronParser.isValid("* * * * *"))
        assertTrue(CronParser.isValid("*/15 0-6 1,15 1-12 0,7"))
        assertTrue(CronParser.isValid("5 12 10 6 3"))
    }

    @Test
    fun `rejects malformed or out of range cron expressions`() {
        assertFalse(CronParser.isValid("* * * *"))
        assertFalse(CronParser.isValid("60 * * * *"))
        assertFalse(CronParser.isValid("* 24 * * *"))
        assertFalse(CronParser.isValid("* * 0 * *"))
        assertFalse(CronParser.isValid("* * * 13 *"))
        assertFalse(CronParser.isValid("* * * * 8"))
        assertFalse(CronParser.isValid("*/0 * * * *"))
        assertFalse(CronParser.isValid("10-5 * * * *"))
    }

    @Test
    fun `returns the next matching minute after the supplied time`() {
        val from = ZonedDateTime.of(2026, 6, 26, 10, 7, 42, 0, ZoneOffset.UTC)

        val next = CronParser.nextFireAfter("*/15 * * * *", from)

        assertEquals(ZonedDateTime.of(2026, 6, 26, 10, 15, 0, 0, ZoneOffset.UTC), next)
    }

    @Test
    fun `does not return the current minute as the next fire time`() {
        val from = ZonedDateTime.of(2026, 6, 26, 10, 15, 0, 0, ZoneOffset.UTC)

        val next = CronParser.nextFireAfter("*/15 * * * *", from)

        assertEquals(ZonedDateTime.of(2026, 6, 26, 10, 30, 0, 0, ZoneOffset.UTC), next)
    }

    @Test
    fun `treats day of week 7 as Sunday`() {
        val from = ZonedDateTime.of(2026, 6, 26, 23, 59, 0, 0, ZoneOffset.UTC)

        val next = CronParser.nextFireAfter("0 9 * * 7", from)

        assertEquals(ZonedDateTime.of(2026, 6, 28, 9, 0, 0, 0, ZoneOffset.UTC), next)
    }

    @Test
    fun `returns null when the expression cannot be parsed`() {
        assertNull(CronParser.nextFireAfter("not a cron", ZonedDateTime.now(ZoneOffset.UTC)))
    }

    @Test
    fun `finds leap day within the search window`() {
        val from = ZonedDateTime.of(2027, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC)

        val next = CronParser.nextFireAfter("0 0 29 2 *", from)

        assertNotNull(next)
        assertEquals(ZonedDateTime.of(2028, 2, 29, 0, 0, 0, 0, ZoneOffset.UTC), next)
    }
}
