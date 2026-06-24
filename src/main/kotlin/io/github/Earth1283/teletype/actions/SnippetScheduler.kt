package io.github.Earth1283.teletype.actions

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.util.TeletypeCommandOrigin
import io.github.Earth1283.teletype.web.model.ScheduledAction
import io.github.Earth1283.teletype.web.model.Snippet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
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
    private val saveLock = Any()
    @Volatile private var pendingSnapshot: List<ScheduledAction>? = null
    @Volatile private var saveJob: Job? = null

    @Synchronized fun getActions(): List<ScheduledAction> = actions.toList()

    @Synchronized fun load() {
        if (!file.exists()) { saveNow(actions.toList()); return }
        try {
            val data = json.decodeFromString<ScheduleData>(file.readText())
            actions.clear(); actions.addAll(data.actions)
        } catch (e: Exception) {
            plugin.messages.console("data.schedule-load-failed", "error" to (e.message ?: "unknown"))
        }
    }

    private fun saveNow(snapshot: List<ScheduledAction>) {
        plugin.dataFolder.mkdirs()
        file.writeText(json.encodeToString(ScheduleData(snapshot)))
    }

    private fun saveAsync() {
        synchronized(saveLock) {
            pendingSnapshot = synchronized(this) { actions.toList() }
            if (saveJob?.isActive == true) return

            saveJob = plugin.pluginScope.launch(Dispatchers.IO) {
                while (isActive) {
                    delay(250L)
                    val snapshot = synchronized(saveLock) {
                        pendingSnapshot.also { pendingSnapshot = null }
                    }
                    if (snapshot != null) saveNow(snapshot)

                    val done = synchronized(saveLock) {
                        if (pendingSnapshot == null) {
                            saveJob = null
                            true
                        } else false
                    }
                    if (done) return@launch
                }
            }
        }
    }

    private fun flushSave() {
        val snapshot = synchronized(saveLock) {
            saveJob?.cancel()
            saveJob = null
            val latest = pendingSnapshot
            pendingSnapshot = null
            latest
        } ?: synchronized(this) { actions.toList() }
        saveNow(snapshot)
    }

    fun startAll() {
        getActions().filter { it.status == "active" }.forEach { scheduleTask(it) }
    }

    fun stopAll() {
        tasks.values.forEach { it.cancel() }
        tasks.clear()
        flushSave()
    }

    @Synchronized fun add(action: ScheduledAction) {
        actions += action; saveAsync()
        if (action.status == "active") scheduleTask(action)
    }

    @Synchronized fun remove(id: String): Boolean {
        if (actions.none { it.id == id }) return false
        tasks[id]?.cancel(); tasks.remove(id)
        actions.removeIf { it.id == id }; saveAsync(); return true
    }

    @Synchronized fun pause(id: String): Boolean {
        val idx = actions.indexOfFirst { it.id == id }
        if (idx < 0) return false
        tasks[id]?.cancel(); tasks.remove(id)
        actions[idx] = actions[idx].copy(status = "paused"); saveAsync(); return true
    }

    @Synchronized fun resume(id: String): Boolean {
        val idx = actions.indexOfFirst { it.id == id }
        if (idx < 0) return false
        actions[idx] = actions[idx].copy(status = "active"); saveAsync()
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
                    synchronized(this) { actions.removeIf { it.id == action.id }; saveAsync() }
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
                            saveAsync()
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
            TeletypeCommandOrigin.run {
                Bukkit.dispatchCommand(sender, filled.removePrefix("/"))
            }
        }
    }

    private fun updateLastRun(id: String, ok: Boolean) {
        val idx = actions.indexOfFirst { it.id == id }
        if (idx >= 0) {
            actions[idx] = actions[idx].copy(lastRunMs = System.currentTimeMillis(), lastRunOk = ok)
            saveAsync()
        }
    }
}
