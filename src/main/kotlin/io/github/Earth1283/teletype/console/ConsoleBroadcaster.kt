package io.github.Earth1283.teletype.console

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.channels.BufferOverflow

class ConsoleBroadcaster(
    @Suppress("unused") private val scope: CoroutineScope,
    replayBufferLines: Int,
    private val maxLineLength: Int,
) {
    private val _flow = MutableSharedFlow<String>(
        replay = replayBufferLines.coerceAtLeast(0),
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val flow: SharedFlow<String> = _flow.asSharedFlow()

    fun emit(line: String) {
        _flow.tryEmit(truncate(line))
    }

    private fun truncate(line: String): String {
        if (maxLineLength <= 0 || line.length <= maxLineLength) return line
        return line.take(maxLineLength) + "...[truncated]"
    }
}
