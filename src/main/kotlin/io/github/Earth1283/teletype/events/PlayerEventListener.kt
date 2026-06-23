package io.github.Earth1283.teletype.events

import io.github.Earth1283.teletype.metrics.MetricsDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.bukkit.event.EventHandler
import org.bukkit.event.EventPriority
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerJoinEvent
import org.bukkit.event.player.PlayerQuitEvent

class PlayerEventListener(
    private val db: MetricsDatabase,
    private val scope: CoroutineScope,
) : Listener {

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    fun onJoin(event: PlayerJoinEvent) {
        val ts   = System.currentTimeMillis()
        val uuid = event.player.uniqueId.toString()
        val name = event.player.name
        scope.launch(Dispatchers.IO) {
            runCatching { db.insertPlayerEvent(ts, uuid, name, "join") }
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    fun onQuit(event: PlayerQuitEvent) {
        val ts   = System.currentTimeMillis()
        val uuid = event.player.uniqueId.toString()
        val name = event.player.name
        scope.launch(Dispatchers.IO) {
            runCatching { db.insertPlayerEvent(ts, uuid, name, "leave") }
        }
    }
}
