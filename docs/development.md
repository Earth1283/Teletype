# Development Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| JDK | 21 | Plugin compilation and Gradle toolchain |
| Node.js | 18+ | Frontend build and mock server |
| npm | 9+ | Frontend dependencies |
| Git | any | Version control |

**macOS with multiple JDKs:** Gradle must use Java 21. If `java -version` shows anything else:
```bash
zsh -ic "java_21 && ./gradlew <task>"
```
`java_21` is a shell alias that sets `JAVA_HOME` to the Java 21 installation. Adjust if your alias is named differently.

---

## Project Structure

```
Teletype/
├── build.gradle.kts              # Gradle build (Kotlin, Ktor, SQLite, Paper API)
├── src/main/
│   ├── kotlin/io/github/Earth1283/teletype/
│   │   ├── Teletype.kt           # Plugin entry point; lifecycle, pluginScope, auditLog
│   │   ├── audit/
│   │   │   └── AuditLog.kt       # SQLite audit log (teletype-audit.db)
│   │   ├── auth/                 # JWT challenge/poll flow
│   │   ├── command/              # /tty Bukkit command
│   │   ├── config/
│   │   │   └── TeletypeConfig.kt # Config loader (config.yml → data classes)
│   │   ├── console/              # Log appender → WebSocket broadcast ring buffer
│   │   ├── events/
│   │   │   └── PlayerEventListener.kt  # PlayerJoinEvent / PlayerQuitEvent → player_events table
│   │   ├── metrics/
│   │   │   ├── MetricsCollector.kt  # BukkitRunnable sampling at 1 Hz
│   │   │   ├── MetricsDatabase.kt   # SQLite storage + downsampling (teletype-metrics.db)
│   │   │   └── RetentionJob.kt      # Nightly downsampling + player_events pruning
│   │   ├── multiplex/
│   │   │   └── PortMultiplexer.kt   # Optional single-port HTTP+Minecraft mux
│   │   └── web/
│   │       ├── WebServer.kt      # Ktor engine + install blocks + route registration
│   │       ├── TlsManager.kt     # Auto/keystore TLS setup
│   │       ├── model/            # @Serializable request/response data classes
│   │       └── routing/
│   │           ├── AuditExt.kt   # auditAsync() RoutingContext extension
│   │           ├── AuditRoutes.kt
│   │           ├── ActionRoutes.kt
│   │           ├── ApiRoutes.kt
│   │           ├── AuthRoutes.kt
│   │           ├── ConsoleWebSocket.kt
│   │           ├── FileRoutes.kt
│   │           ├── GlanceRoutes.kt
│   │           └── StatsRoutes.kt    # /api/stats/* (player events)
│   └── resources/
│       ├── config.yml            # Default config (copied to dataFolder on first start)
│       └── webroot/              # Compiled frontend assets served by Ktor static handler
└── frontend/
    ├── package.json
    ├── vite.config.ts            # Dev proxy: /api + /ws → localhost:8080
    ├── scripts/
    │   └── mock-server.mjs       # Synthetic data server for testFrontend
    └── src/
        ├── App.tsx               # Tab bar, route render
        ├── LogContext.tsx        # Single WebSocket source of truth for console logs + tab complete
        ├── SettingsContext.tsx   # Persistent client settings (localStorage)
        ├── CommandPalette.tsx    # Cmd+K palette
        ├── Icons.tsx             # SVG icon components
        └── components/
            ├── GlancePage.tsx
            ├── Console.tsx       # Live log stream, command input, Tab completion, right-click QA
            ├── ServerStats.tsx   # Live cards + historical charts + Z-overlay + correlation table
            ├── SettingsPage.tsx
            ├── AuditPage.tsx
            └── actions/
```

---

## `testFrontend` — Live Mock Dev Server

Run the full frontend against synthetic live data — no Minecraft server needed:

```bash
cd frontend
npm install         # first time only
npm run testFrontend
```

This starts two processes via `concurrently`:

| Process | Port | Purpose |
|---------|------|---------|
| `mock` (cyan) | 8080 | Node.js mock server (`scripts/mock-server.mjs`) |
| `vite` (green) | 5173 | Vite HMR dev server |

Open `http://localhost:5173`. Auth is bypassed — clicking verify returns a token immediately.

### What the mock server simulates

**Metrics:** Brownian-motion state machine updated every 1 second, pre-filled with 300 snapshots (5 minutes of history):
- **TPS** — random walk [18.5, 20.0] with 2% lag event chance (drops to ~15 TPS for 10–30s, then recovers)
- **JVM heap + GC events** — sawtooth heap growth with synthetic GC events from `/api/glance/gc-events`
- **CPU %** — random walk [5, 95]
- **System RAM** — slow drift [40%, 80%]
- **Entity/chunk/player counts** — slow random walks
- Disk stays constant (no state machine needed)

**Console:** WebSocket at `/ws/console`. On connect: 40-line log replay burst. Then variable-cadence stream (400–2600ms between lines) using recursive `setTimeout`. Commands echo back; `list` returns a fake player count, `gc` triggers a simulated GC event and heap drop.

Tab completion: the mock returns a static list of common Minecraft commands for any partial input.

**Actions:** In-memory CRUD stubs — categories, snippets, and schedule entries persist for the session, reset on server restart.

**Files:** Returns a static directory tree. Read/write/delete operations acknowledge but don't touch disk.

**Audit:** Seeded with 20 sample entries; new entries appended on relevant API calls.

**Stats:** `/api/stats/player-events` returns a seeded list of join/leave events spread across the last 60 minutes.

### Proxy configuration

`vite.config.ts` proxies `/api/*` and `/ws/*` to `localhost:8080`, so the frontend code never needs to know whether it's talking to the mock or a real server.

---

## Build Pipeline

### Full build (frontend + plugin JAR)

```bash
zsh -ic "java_21 && ./gradlew build"
```

Gradle runs the `npmBuild` task first (defined in `build.gradle.kts`), which runs `npm install && npm run build` in `frontend/`. The compiled assets land in `src/main/resources/webroot/`. Then the Kotlin compile + shadow JAR task bundles everything.

### Frontend only

```bash
cd frontend
npm run build       # TypeScript compile → Vite bundle → dist/
```

Output goes to `frontend/dist/`; the Gradle task then copies it to `webroot/`.

### Plugin only (skip frontend rebuild)

```bash
zsh -ic "java_21 && ./gradlew shadowJar -x npmBuild"
```

Useful when only Kotlin files changed and `webroot/` already has current assets.

---

## Architecture

### Request flow

```
Browser
  │  HTTP/WS
  ▼
[PortMultiplexer :25565]  ← optional; peeks first 4 bytes, routes by HTTP vs. game
  │                  │
  ▼ HTTP             ▼ Minecraft
Ktor (embedded, netty)     Minecraft server (internal port)
  ├── Rate limit (IP-keyed, before auth on all routes)
  ├── /api/auth/*        → AuthRoutes (no JWT check)
  ├── /api/*             → JWT auth → feature routes
  │     ├── ApiRoutes    → Bukkit thread dispatch for /execute
  │     ├── GlanceRoutes → MetricsCollector / MetricsDatabase
  │     ├── StatsRoutes  → MetricsDatabase player events
  │     ├── ActionRoutes → in-memory + SQLite action store
  │     ├── FileRoutes   → server filesystem (canonicalized)
  │     └── AuditRoutes  → AuditLog SQLite
  └── /ws/console        → ConsoleWebSocket ↔ console log appender
```

### Threading model

- **Bukkit main thread** — `MetricsCollector` BukkitRunnable reads TPS/tick/heap/entities/chunks/pings at 1 Hz. `PlayerEventListener` handles join/quit events. Writing then crosses to Ktor via coroutines on `Dispatchers.Default`.
- **Ktor I/O threads** — all HTTP route handlers run on `Dispatchers.IO` or the Ktor dispatcher. JDBC calls (`MetricsDatabase`, `AuditLog`) must explicitly `withContext(Dispatchers.IO)`.
- **`pluginScope`** — `SupervisorJob + Dispatchers.Default`, `internal` visibility, lives from `onEnable` to `onDisable`. Fire-and-forget audit inserts and player event writes use `pluginScope.launch(Dispatchers.IO)`.
- **`AuditLog`** — single JDBC `Connection`, `@Synchronized` on every public method to guard against concurrent `Dispatchers.IO` threads.
- **Tab completion** — `ConsoleWebSocket` receives `tab_complete` WS messages, calls `Bukkit.getScheduler().callSyncMethod()` inside `withContext(Dispatchers.IO)` with a 500 ms timeout to marshal onto the Bukkit main thread, then sends the result back.
- **PortMultiplexer** — dedicated `CachedThreadPool` of daemon threads; independent of `pluginScope`. Shuts down via `executor.shutdownNow()` on `uninstall()`.

### Data persistence

| File | Format | Contents |
|------|--------|---------|
| `teletype-metrics.db` | SQLite WAL | Three resolution tiers: `metrics_1s`, `metrics_1m`, `metrics_15m`; `player_events` join/leave log |
| `teletype-audit.db` | SQLite WAL | `audit_log` table with indexes on `ts`, `actor`, `action` |
| `schedule.json` | JSON | Serialized scheduled action list (survives restarts) |
| `config.yml` | YAML | User config; never overwritten by the plugin |

### MetricSnapshot fields

Sampled once per second on the Bukkit main thread. All fields present in all three resolution tables via idempotent `ALTER TABLE` migrations on startup.

| Field | Type | Notes |
|-------|------|-------|
| `tps1/5/15` | `REAL` | Bukkit `getTPS()` |
| `tick_ms` | `REAL` | 20-tick rolling average of `Server.getTickTimes()` |
| `mem_used/total/max` | `INTEGER` | JVM `Runtime` heap in MB |
| `uptime_ms` | `INTEGER` | `RuntimeMXBean.uptime` |
| `cpu_pct` | `REAL` | Host CPU via `OperatingSystemMXBean.getCpuLoad()`. `NULL` if unavailable. |
| `sys_mem_used/total` | `INTEGER` | Host RAM in MB. `NULL` if unavailable. |
| `disk_used/total_gb` | `INTEGER` | Server world container filesystem. `NULL` if unavailable. |
| `player_count` | `INTEGER` | `Bukkit.getOnlinePlayers().size` |
| `entity_count` | `INTEGER` | `world.entities.size` summed across all worlds |
| `loaded_chunks` | `INTEGER` | `world.loadedChunks.size` summed across all worlds |
| `ping_p50/p95` | `INTEGER` | Median and P95 player ping via `Player.getPing()`. `NULL` if no players or method unavailable. |

### WebSocket console

`LogContext.tsx` is the **single WebSocket connection** for the whole frontend. It:
1. Opens one WS connection on mount (or on tab focus after disconnect)
2. Pushes log lines into a `useState` rolling buffer (capped at 5000 lines)
3. Exposes `lines`, `send`, `tabComplete`, and `getLogsAround` via React context

All components that need logs read from `LogContext` — they don't open their own connections. Tab completion uses a one-shot callback registered before `sendTabComplete` fires; the callback is cleared after the first response or on WS disconnect.

**Keep-alive settings** (configured in `WebServer.kt`):

| Setting | Value |
|---------|-------|
| Ping period | 30 seconds |
| Inactivity timeout | 60 seconds |

The server sends a WebSocket ping every 30 seconds. If no pong is received within 60 seconds, the server closes the connection. The frontend reconnects automatically on disconnect.

### Stats page analysis

`ServerStats.tsx` computes all analysis client-side from the history array returned by `/api/glance/history`:

- **Z-score overlay** — for each series, extracts values, computes mean/std from the full window, maps each point to `(v - mean) / std`. Anomaly timestamps (any |z| ≥ threshold) get amber vertical markers.
- **Pearson correlation** — computed pairwise for all 8 metrics (TPS, MSPT, JVM Mem, CPU, Players, Entities, Chunks, Ping). Pairs with fewer than 5 shared non-null data points are excluded.
- **Log lookup** — clicking an anomaly marker calls `getLogsAround(ts, ±30s)` on the in-memory `tsLogs` buffer. Returns empty if the timestamp is outside the buffer (which holds the last ~2000 parsed log lines with timestamps).

---

## Adding a New API Endpoint

1. Add a route function in `web/routing/YourRoutes.kt`:
   ```kotlin
   fun Route.yourRoutes(plugin: Teletype) {
       get("/your-endpoint") {
           // ...
           call.respond(result)
       }
   }
   ```
2. Register in `WebServer.kt` inside the authenticated `rateLimit` → `authenticate` → `route("/api")` block:
   ```kotlin
   route("/stats") { statsRoutes(plugin) }
   // add yours:
   route("/yours") { yourRoutes(plugin) }
   ```
3. Add corresponding fetch in `frontend/src/` using TanStack Query.
4. Add a stub handler in `frontend/scripts/mock-server.mjs` so `testFrontend` works.

For audited endpoints, call `auditAsync(plugin, "action_name", detail)` inside the handler (the `RoutingContext` extension in `AuditExt.kt`).

### Route registration order

`WebServer.kt` wraps all authenticated routes as:
```
rateLimit("api") {
    authenticate("auth-jwt") {
        route("/api") { ... }
    }
}
```
Rate limiting is the outermost layer — a blocked IP never reaches JWT verification. Keep this order when adding new route groups.

### Known config/behavior gaps

Every key in `config.yml` is wired to its implementation as of this version. Feature master switches (`actions.enabled`, `files.enabled`, `profiling.enabled`, `console.enabled`) reject requests at the route level via a `RouteScopedPlugin` installed with `install(createRouteScopedPlugin(...) { onCall { ... } })` — see `ActionRoutes.kt`, `FileRoutes.kt`, `ProfilingRoutes.kt`, `ConsoleWebSocket.kt`. This is the Ktor 3.x replacement for the old `Route.intercept(ApplicationCallPipeline.Plugins) { ... }` pattern: in Ktor 3, `Route` is an interface with no `intercept` member (only the internal `RoutingNode` implementation has one), so gating a whole route subtree has to go through `Route.install()` with a route-scoped plugin instead.

Player join/leave events and GC events are always pruned at a fixed 30 days in `RetentionJob` — there is no `config.yml` key for this interval. If that needs to become configurable, add a `metrics.sqlite.retention.player-events-days` property to `TeletypeConfig` the same way the other retention keys are wired, then read it in `RetentionJob.runRetention()` instead of the hardcoded `d30` constant.

`network.enabled: false` and the port-forward/route-mapping equivalents are handled differently on purpose: per `config.yml`'s own comment ("disable path routing without removing saved routes"), the `/api/network/*` management endpoints stay reachable so routes/forwards can still be listed, created, and edited while disabled — only the actual traffic-forwarding behavior (`PortForwardManager.bind`, `PortMultiplexer`'s routing decision) checks the flag. Don't "fix" this to also 403 the management routes; it's intentional.
