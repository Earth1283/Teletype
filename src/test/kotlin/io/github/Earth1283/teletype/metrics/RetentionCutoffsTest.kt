package io.github.Earth1283.teletype.metrics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RetentionCutoffsTest {
    private val now = 1_000_000_000_000L

    @Test
    fun `cutoffs follow the configured ages`() {
        val cutoffs = RetentionCutoffs.at(now, rawAfterHours = 48, minuteAfterDays = 7, delete15mAfterDays = 90)
        assertEquals(now - 48 * 3_600_000L, cutoffs.downsampleRawBefore)
        assertEquals(now - 7 * 86_400_000L, cutoffs.downsampleMinutesBefore)
        assertEquals(now - 90 * 86_400_000L, cutoffs.delete15mBefore)
    }

    @Test
    fun `zero keeps 15-minute rows forever`() {
        assertNull(RetentionCutoffs.at(now, 48, 7, 0).delete15mBefore)
    }
}
