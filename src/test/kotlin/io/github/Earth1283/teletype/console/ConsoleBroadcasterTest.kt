package io.github.Earth1283.teletype.console

import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class ConsoleBroadcasterTest {
    @Test
    fun `lines carry increasing sequence numbers and are truncated`() = runBlocking {
        val broadcaster = ConsoleBroadcaster(replayBufferLines = 10, maxLineLength = 5)
        broadcaster.emit("one")
        broadcaster.emit("a long line")

        val lines = broadcaster.flow.take(2).toList()
        assertEquals(listOf(0L, 1L), lines.map { it.seq })
        assertEquals("a lon...[truncated]", lines[1].text)
    }
}
