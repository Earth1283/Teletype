package io.github.Earth1283.teletype.multiplex

import io.github.Earth1283.teletype.util.JsonListStore
import java.io.File
import java.util.logging.Logger

class PortForwardStore(dataFolder: File, logger: Logger? = null) {
    private val store = JsonListStore(File(dataFolder, "port-forwards.json"), PortForward.serializer(), PortForward::id, logger)

    fun load() = store.load()
    fun getForwards(): List<PortForward> = store.all()
    fun getForward(id: String): PortForward? = store.find(id)
    suspend fun addForward(forward: PortForward) = store.add(forward)
    suspend fun updateForward(forward: PortForward): Boolean = store.update(forward)
    suspend fun removeForward(id: String): Boolean = store.remove(id)
}
