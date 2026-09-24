package io.github.Earth1283.teletype.console

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.util.UUID

data class ConsoleLine(val seq: Long, val text: String)

class ConsoleBroadcaster(replayBufferLines: Int, private val maxLineLength: Int) {
    val epoch: String = UUID.randomUUID().toString()
    private var nextSeq = 0L

    private val _flow = MutableSharedFlow<ConsoleLine>(
        replay = replayBufferLines.coerceAtLeast(0),
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val flow: SharedFlow<ConsoleLine> = _flow.asSharedFlow()

    @Synchronized
    fun emit(line: String) {
        _flow.tryEmit(ConsoleLine(nextSeq++, truncate(line)))
    }

    private fun truncate(line: String): String =
        if (maxLineLength <= 0 || line.length <= maxLineLength) line
        else line.take(maxLineLength) + "...[truncated]"
}
