package io.github.Earth1283.teletype.console

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.channels.BufferOverflow

class ConsoleBroadcaster(private val scope: CoroutineScope) {
    private val _flow = MutableSharedFlow<String>(
        replay = 1000,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val flow: SharedFlow<String> = _flow.asSharedFlow()

    fun emit(line: String) {
        scope.launch { _flow.emit(line) }
    }
}
