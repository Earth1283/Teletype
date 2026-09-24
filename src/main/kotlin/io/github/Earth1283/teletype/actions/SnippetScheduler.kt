package io.github.Earth1283.teletype.actions

import io.github.Earth1283.teletype.Teletype
import io.github.Earth1283.teletype.util.TeletypeCommandOrigin
import io.github.Earth1283.teletype.util.onServerThread
import io.github.Earth1283.teletype.util.writeTextAtomic
import io.github.Earth1283.teletype.web.model.ScheduledAction
import io.github.Earth1283.teletype.web.model.Snippet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.bukkit.Bukkit
import java.io.File
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.ConcurrentHashMap

@Serializable
private data class ScheduleData(val actions: List<ScheduledAction> = emptyList())

private const val DEFAULT_INTERVAL_MS = 1_800_000L
private const val SAVE_DEBOUNCE_MS = 250L

class SnippetScheduler(private val plugin: Teletype, private val store: SnippetStore) {
    private val file = File(plugin.dataFolder, "schedule.json")
    private val json = Json { prettyPrint = true; encodeDefaults = true; ignoreUnknownKeys = true }
    private val jobs = ConcurrentHashMap<String, Job>()
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

    fun startAll() {
        getActions().filter { it.status == "active" }.forEach(::scheduleTask)
    }

    fun stopAll() {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
        flushSave()
    }

    @Synchronized fun add(action: ScheduledAction) {
        actions += action
        saveAsync()
        if (action.status == "active") scheduleTask(action)
    }

    @Synchronized fun remove(id: String): Boolean {
        if (!actions.removeIf { it.id == id }) return false
        jobs.remove(id)?.cancel()
        saveAsync()
        return true
    }

    @Synchronized fun removeForSnippet(snippetId: String): Int {
        val doomed = actions.filter { it.snippetId == snippetId }
        doomed.forEach { remove(it.id) }
        return doomed.size
    }

    @Synchronized fun pause(id: String): Boolean {
        if (!updateAction(id) { it.copy(status = "paused") }) return false
        jobs.remove(id)?.cancel()
        return true
    }

    @Synchronized fun resume(id: String): Boolean {
        if (!updateAction(id) { it.copy(status = "active") }) return false
        actions.find { it.id == id }?.let(::scheduleTask)
        return true
    }

    fun executeNow(snippet: Snippet, vars: Map<String, String>) {
        Bukkit.getScheduler().runTask(plugin, Runnable { dispatchCommands(snippet, vars) })
    }

    private fun scheduleTask(action: ScheduledAction) {
        if (!plugin.teletypeConfig.actionsSchedulingEnabled) return
        jobs.remove(action.id)?.cancel()
        jobs[action.id] = plugin.pluginScope.launch {
            when (action.mode) {
                "once" -> runOnce(action)
                "ntimes" -> runNTimes(action)
                "forever" -> if (action.cronExpr != null) runCron(action, action.cronExpr) else runForever(action)
            }
        }
    }

    private suspend fun runOnce(action: ScheduledAction) {
        delayUntil(action.runAt ?: System.currentTimeMillis())
        fire(action)
        synchronized(this) { remove(action.id) }
    }

    private suspend fun runNTimes(action: ScheduledAction) {
        val interval = action.intervalOrDefault()
        var remaining = action.runsRemaining ?: action.repeatCount ?: 1
        var nextRun = action.lastRunMs?.plus(interval) ?: action.runAt ?: System.currentTimeMillis()
        while (remaining > 0) {
            delayUntil(nextRun)
            val ok = fire(action)
            remaining--
            val finished = remaining <= 0
            synchronized(this) {
                updateAction(action.id) {
                    it.copy(
                        runsRemaining = remaining,
                        lastRunMs = System.currentTimeMillis(),
                        lastRunOk = ok,
                        status = if (finished) "paused" else it.status,
                    )
                }
            }
            nextRun += interval
        }
        jobs.remove(action.id)
    }

    private suspend fun runForever(action: ScheduledAction) {
        val interval = action.intervalOrDefault()
        var nextRun = action.lastRunMs?.plus(interval) ?: (System.currentTimeMillis() + interval)
        while (true) {
            delayUntil(nextRun)
            recordRun(action.id, fire(action))
            nextRun = maxOf(nextRun + interval, System.currentTimeMillis())
        }
    }

    private suspend fun runCron(action: ScheduledAction, expr: String) {
        while (true) {
            val next = CronParser.nextFireAfter(expr, ZonedDateTime.now(ZoneId.systemDefault())) ?: return
            delayUntil(next.toInstant().toEpochMilli())
            recordRun(action.id, fire(action))
        }
    }

    private suspend fun delayUntil(epochMs: Long) {
        while (true) {
            val remaining = epochMs - System.currentTimeMillis()
            if (remaining <= 0) return
            delay(remaining)
        }
    }

    private suspend fun fire(action: ScheduledAction): Boolean {
        val snippet = store.findSnippet(action.snippetId) ?: return false
        return plugin.onServerThread { dispatchCommands(snippet, action.vars) }
    }

    private fun dispatchCommands(snippet: Snippet, vars: Map<String, String>): Boolean {
        val sender = Bukkit.getConsoleSender()
        return snippet.cmds.map { cmd ->
            val filled = vars.entries.fold(cmd) { acc, (k, v) -> acc.replace("{$k}", v) }
            runCatching {
                TeletypeCommandOrigin.run { Bukkit.dispatchCommand(sender, filled.trimStart().removePrefix("/")) }
            }.getOrDefault(false)
        }.all { it }
    }

    private fun recordRun(id: String, ok: Boolean) = synchronized(this) {
        updateAction(id) { it.copy(lastRunMs = System.currentTimeMillis(), lastRunOk = ok) }
    }

    private fun updateAction(id: String, transform: (ScheduledAction) -> ScheduledAction): Boolean {
        val idx = actions.indexOfFirst { it.id == id }
        if (idx < 0) return false
        actions[idx] = transform(actions[idx])
        saveAsync()
        return true
    }

    private fun ScheduledAction.intervalOrDefault() = (intervalMs ?: DEFAULT_INTERVAL_MS).coerceAtLeast(1_000L)

    private fun saveNow(snapshot: List<ScheduledAction>) {
        file.writeTextAtomic(json.encodeToString(ScheduleData.serializer(), ScheduleData(snapshot)))
    }

    private fun saveAsync() {
        synchronized(saveLock) {
            pendingSnapshot = synchronized(this) { actions.toList() }
            if (saveJob?.isActive == true) return

            saveJob = plugin.pluginScope.launch(Dispatchers.IO) {
                while (isActive) {
                    delay(SAVE_DEBOUNCE_MS)
                    val snapshot = synchronized(saveLock) { pendingSnapshot.also { pendingSnapshot = null } }
                    if (snapshot != null) saveNow(snapshot)

                    val done = synchronized(saveLock) {
                        (pendingSnapshot == null).also { if (it) saveJob = null }
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
            pendingSnapshot.also { pendingSnapshot = null }
        } ?: synchronized(this) { actions.toList() }
        saveNow(snapshot)
    }
}
