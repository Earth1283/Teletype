package io.github.Earth1283.teletype.actions

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.web.model.ScheduledAction
import io.github.Earth1283.teletype.web.model.Snippet
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.bukkit.Bukkit
import org.bukkit.scheduler.BukkitTask
import java.io.File
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.ConcurrentHashMap

@Serializable
private data class ScheduleData(val actions: List<ScheduledAction> = emptyList())

class SnippetScheduler(private val plugin: Teletype, private val store: SnippetStore) {
    private val file = File(plugin.dataFolder, "schedule.json")
    private val json = Json { prettyPrint = true; encodeDefaults = true; ignoreUnknownKeys = true }
    private val tasks = ConcurrentHashMap<String, BukkitTask>()
    private val actions = mutableListOf<ScheduledAction>()

    @Synchronized fun getActions(): List<ScheduledAction> = actions.toList()

    @Synchronized fun load() {
        if (!file.exists()) { save(); return }
        try {
            val data = json.decodeFromString<ScheduleData>(file.readText())
            actions.clear(); actions.addAll(data.actions)
        } catch (e: Exception) {
            plugin.messages.console("data.schedule-load-failed", "error" to (e.message ?: "unknown"))
        }
    }

    @Synchronized fun save() {
        plugin.dataFolder.mkdirs()
        file.writeText(json.encodeToString(ScheduleData(actions.toList())))
    }

    fun startAll() {
        getActions().filter { it.status == "active" }.forEach { scheduleTask(it) }
    }

    fun stopAll() {
        tasks.values.forEach { it.cancel() }
        tasks.clear()
    }

    @Synchronized fun add(action: ScheduledAction) {
        actions += action; save()
        if (action.status == "active") scheduleTask(action)
    }

    @Synchronized fun remove(id: String): Boolean {
        if (actions.none { it.id == id }) return false
        tasks[id]?.cancel(); tasks.remove(id)
        actions.removeIf { it.id == id }; save(); return true
    }

    @Synchronized fun pause(id: String): Boolean {
        val idx = actions.indexOfFirst { it.id == id }
        if (idx < 0) return false
        tasks[id]?.cancel(); tasks.remove(id)
        actions[idx] = actions[idx].copy(status = "paused"); save(); return true
    }

    @Synchronized fun resume(id: String): Boolean {
        val idx = actions.indexOfFirst { it.id == id }
        if (idx < 0) return false
        actions[idx] = actions[idx].copy(status = "active"); save()
        scheduleTask(actions[idx]); return true
    }

    fun executeNow(snippetId: String, vars: Map<String, String>) {
        val snippet = store.findSnippet(snippetId) ?: return
        Bukkit.getScheduler().runTask(plugin, Runnable { dispatchCommands(snippet, vars) })
    }

    private fun scheduleTask(action: ScheduledAction) {
        val snippet = store.findSnippet(action.snippetId) ?: return
        tasks[action.id]?.cancel()
        val nowMs = System.currentTimeMillis()

        when (action.mode) {
            "once" -> {
                val delayTicks = (((action.runAt ?: nowMs) - nowMs) / 50).coerceAtLeast(1)
                tasks[action.id] = Bukkit.getScheduler().runTaskLater(plugin, Runnable {
                    dispatchCommands(snippet, action.vars)
                    tasks.remove(action.id)
                    synchronized(this) { actions.removeIf { it.id == action.id }; save() }
                }, delayTicks)
            }

            "ntimes" -> {
                val initialTicks = (((action.runAt ?: nowMs) - nowMs) / 50).coerceAtLeast(1)
                val periodTicks  = ((action.intervalMs ?: 1_800_000L) / 50).coerceAtLeast(1)
                var remaining    = action.runsRemaining ?: action.repeatCount ?: 1
                tasks[action.id] = Bukkit.getScheduler().runTaskTimer(plugin, Runnable {
                    dispatchCommands(snippet, action.vars)
                    remaining--
                    synchronized(this) {
                        val idx = actions.indexOfFirst { it.id == action.id }
                        if (idx >= 0) {
                            if (remaining <= 0) {
                                actions[idx] = actions[idx].copy(
                                    status = "paused", runsRemaining = 0,
                                    lastRunMs = System.currentTimeMillis(), lastRunOk = true
                                )
                                tasks[action.id]?.cancel(); tasks.remove(action.id)
                            } else {
                                actions[idx] = actions[idx].copy(
                                    runsRemaining = remaining,
                                    lastRunMs = System.currentTimeMillis(), lastRunOk = true
                                )
                            }
                            save()
                        }
                    }
                }, initialTicks, periodTicks)
            }

            "forever" -> {
                if (action.cronExpr != null) {
                    scheduleCron(action, snippet)
                } else {
                    val periodTicks = ((action.intervalMs ?: 1_800_000L) / 50).coerceAtLeast(1)
                    tasks[action.id] = Bukkit.getScheduler().runTaskTimer(plugin, Runnable {
                        dispatchCommands(snippet, action.vars)
                        synchronized(this) { updateLastRun(action.id, true) }
                    }, periodTicks, periodTicks)
                }
            }
        }
    }

    private fun scheduleCron(action: ScheduledAction, snippet: Snippet) {
        val expr = action.cronExpr ?: return
        val next = CronParser.nextFireAfter(expr, ZonedDateTime.now(ZoneId.systemDefault())) ?: return
        val delayTicks = ((next.toInstant().toEpochMilli() - System.currentTimeMillis()) / 50).coerceAtLeast(1)
        tasks[action.id] = Bukkit.getScheduler().runTaskLater(plugin, Runnable {
            val stillActive = synchronized(this) { actions.find { it.id == action.id }?.status == "active" }
            if (stillActive) {
                dispatchCommands(snippet, action.vars)
                synchronized(this) { updateLastRun(action.id, true) }
                scheduleCron(action, snippet)
            }
        }, delayTicks)
    }

    private fun dispatchCommands(snippet: Snippet, vars: Map<String, String>) {
        val sender = Bukkit.getConsoleSender()
        snippet.cmds.forEach { cmd ->
            val filled = vars.entries.fold(cmd) { acc, (k, v) -> acc.replace("{$k}", v) }
            Bukkit.dispatchCommand(sender, filled.removePrefix("/"))
        }
    }

    private fun updateLastRun(id: String, ok: Boolean) {
        val idx = actions.indexOfFirst { it.id == id }
        if (idx >= 0) {
            actions[idx] = actions[idx].copy(lastRunMs = System.currentTimeMillis(), lastRunOk = ok)
            save()
        }
    }
}
