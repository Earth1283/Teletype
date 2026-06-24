package io.github.Earth1283.teletype.util

object TeletypeCommandOrigin {
    private val active = ThreadLocal<Boolean>()

    val isActive: Boolean get() = active.get() == true

    fun <T> run(block: () -> T): T {
        val previous = active.get()
        active.set(true)
        return try {
            block()
        } finally {
            if (previous == null) active.remove() else active.set(previous)
        }
    }
}
