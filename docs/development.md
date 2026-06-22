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
│   │   ├── metrics/
│   │   │   ├── MetricsCollector.kt  # BukkitRunnable sampling at 1 Hz
│   │   │   ├── MetricsDatabase.kt   # SQLite storage + downsampling (teletype-metrics.db)
│   │   │   └── RetentionJob.kt      # Background job for row expiry / downsampling
│   │   ├── standalone/           # Standalone (non-Paper) startup path
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
│   │           └── GlanceRoutes.kt
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
        ├── LogContext.tsx        # Single WebSocket source of truth for console logs
        ├── SettingsContext.tsx   # Persistent client settings (localStorage)
        ├── CommandPalette.tsx    # Cmd+K palette
        ├── Icons.tsx             # SVG icon components
        └── components/
            ├── GlancePage.tsx
            ├── Console.tsx
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
- **JVM heap** — sawtooth: fills at ~0.3 MB/s, GC drop at 85% usage or 0.4% random chance
- **CPU %** — random walk [5, 95]
- **System RAM** — slow drift [40%, 80%]
- Disk stays constant (no state machine needed)

**Console:** WebSocket at `/ws/console`. On connect: 40-line log replay burst. Then variable-cadence stream (400–2600ms between lines) using recursive `setTimeout`. Commands echo back; `list` returns a fake player count, `gc` triggers a simulated GC drop.

**Actions:** In-memory CRUD stubs — categories, snippets, and schedule entries persist for the session, reset on server restart.

**Files:** Returns a static directory tree. Read/write/delete operations acknowledge but don't touch disk.

**Audit:** Seeded with 20 sample entries; new entries appended on relevant API calls.

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
Ktor (embedded, netty)
  ├── /api/auth/*        → AuthRoutes (no JWT check)
  ├── /api/*             → JWT auth → feature routes
  │     ├── ApiRoutes    → Bukkit thread dispatch for /execute
  │     ├── GlanceRoutes → MetricsCollector / MetricsDatabase
  │     ├── ActionRoutes → in-memory + SQLite action store
  │     ├── FileRoutes   → server filesystem (canonicalized)
  │     └── AuditRoutes  → AuditLog SQLite
  └── /ws/console        → ConsoleWebSocket ↔ console log appender
```

### Threading model

- **Bukkit main thread** — `MetricsCollector` BukkitRunnable reads TPS/tick/heap. Writing state then crosses to Ktor via a coroutine on `Dispatchers.Default`.
- **Ktor I/O threads** — all HTTP route handlers run on `Dispatchers.IO` or the Ktor dispatcher. JDBC calls (`MetricsDatabase`, `AuditLog`) must explicitly `withContext(Dispatchers.IO)`.
- **`pluginScope`** — `SupervisorJob + Dispatchers.Default`, lives from `onEnable` to `onDisable`. Fire-and-forget audit inserts use `pluginScope.launch(Dispatchers.IO)` to survive after the HTTP response is sent (Ktor request coroutines cancel on response completion).
- **`AuditLog`** — single JDBC `Connection`, `@Synchronized` on every public method to guard against concurrent `Dispatchers.IO` threads.

### Data persistence

| File | Format | Contents |
|------|--------|---------|
| `teletype-metrics.db` | SQLite WAL | Three resolution tiers: `metrics_1s`, `metrics_1m`, `metrics_15m` |
| `teletype-audit.db` | SQLite WAL | `audit_log` table with indexes on `ts`, `actor`, `action` |
| `schedule.json` | JSON | Serialized scheduled action list (survives restarts) |
| `config.yml` | YAML | User config; never overwritten by the plugin |

### WebSocket console

`LogContext.tsx` is the **single WebSocket connection** for the whole frontend. It:
1. Opens one WS connection on mount (or on tab focus after disconnect)
2. Pushes log lines into a `useReducer` rolling buffer (capped at 5000 lines)
3. Exposes `logs` and `sendCommand` via React context

All components that need logs read from `LogContext` — they don't open their own connections.

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
2. Register in `WebServer.kt` inside the authenticated route block:
   ```kotlin
   authenticate("auth-jwt") {
       route("/api") {
           // ...
           yourRoutes(plugin)
       }
   }
3. Add corresponding fetch in `frontend/src/` using TanStack Query.
4. Add a stub handler in `frontend/scripts/mock-server.mjs` so `testFrontend` works.

For audited endpoints, call `auditAsync(plugin, "action_name", detail)` inside the handler (the `RoutingContext` extension in `AuditExt.kt`).
