# API Reference

Base URL: `http://<host>:<port>/api`

All endpoints except `/api/auth/*` require a valid JWT in the `Authorization` header:
```
Authorization: Bearer <token>
```

Errors always return JSON:
```json
{ "error": "Human-readable error message" }
```

> **Rate limiting order:** Spam-check runs before authentication on all routes. An IP that exceeds its rate limit never reaches JWT verification. Auth routes (`/api/auth/*`) and the WebSocket endpoint (`/ws/console`) each have their own IP-keyed limits.

---

## Authentication

### `POST /api/auth/challenge`

Request a new login challenge. No authentication required.

**Response 200:**
```json
{
  "uuid": "3f2a9c1d-...",
  "message": "Run `/tty verify 3f2a9c1d-...` in-game or in the server console"
}
```

Rate limited: 10 requests/minute per IP (configurable).

---

### `GET /api/auth/poll/{uuid}`

Poll for the result of a challenge. Call this repeatedly (every 1–2 seconds) after requesting a challenge.

| Status | Meaning |
|--------|---------|
| `202` | Pending — `/tty verify` not yet run |
| `200` | Verified — JWT included in response |
| `404` | UUID unknown or expired (TTL: 5 min default) |

**Response 200 (verified):**
```json
{
  "status": "verified",
  "token": "<JWT>"
}
```

**Response 202 (pending):**
```json
{ "status": "pending" }
```

Long-poll: the server holds the request open for up to 30 seconds before returning `pending`, so clients don't need to hammer the endpoint.

---

## WebSocket — Console

### `GET /ws/console?token=<jwt>`

Bidirectional console stream. The JWT is passed as a query parameter (browsers cannot set custom WebSocket headers).

Rate limited at the connection upgrade using the **auth** rate limit bucket (same as `/api/auth/*`, default 10 req/min per IP). Once connected, message exchange is not rate limited. The server closes idle connections after 60 seconds without a pong response to its 30-second ping.

**Server → Client messages:**

| `type` | `payload` | Description |
|--------|-----------|-------------|
| `log` | Log line string | Console output. On connect, the last N lines are replayed (default 1000). |
| `tab_complete` | JSON-encoded `string[]` | Response to a `tab_complete` request. Empty array = no completions. |

**Client → Server messages:**

| `type` | `payload` | Description |
|--------|-----------|-------------|
| `command` | Command string | Execute as console sender. Equivalent to typing in server console. |
| `tab_complete` | Partial command string | Request tab completions. Server responds with a `tab_complete` message. |

All messages are JSON objects: `{ "type": "...", "payload": "..." }`.

Tab completions are fetched via `CommandMap.tabComplete()` on the Bukkit main thread with a 500 ms timeout. Max concurrent connections: 8 (configurable via `server.max-websocket-connections`).

---

## Server Status

### `GET /api/status`

**Response 200:**
```json
{
  "name": "Paper",
  "version": "git-Paper-453 (MC: 1.21.1)",
  "onlinePlayers": 3,
  "maxPlayers": 20,
  "tps": [19.98, 19.95, 19.91],
  "worldCount": 3,
  "pluginCount": 12
}
```

`tps` array: 1-minute, 5-minute, 15-minute averages. These are raw Bukkit TPS values and are **not** clamped to 20 (unlike the metrics history endpoint, which clamps to [0, 20]).

---

## Players

### `GET /api/players`

**Response 200:** Array of online players.
```json
[
  {
    "name": "Notch",
    "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    "world": "world",
    "health": 20.0,
    "foodLevel": 20,
    "level": 35,
    "gameMode": "survival",
    "ping": 42,
    "isOp": true
  }
]
```

### `POST /api/execute`

Dispatch a command as the console sender. Audited.

**Request body:**
```json
{ "command": "kick Notch" }
```

**Response 200:**
```json
{ "status": "dispatched" }
```

The response returns immediately once the command is queued on the Bukkit scheduler. The command runs asynchronously — `200 OK` does not mean the command has completed, only that it was accepted. The audit log entry is also written asynchronously after dispatch.

Rate limited: 30 requests/minute per IP (separate from the general API limit).

---

## Glance — Metrics

### `GET /api/glance/current`

Latest metric snapshot. Returns `503 Service Unavailable` if the sampler has not yet produced its first reading (normally resolves within one second of plugin start).

**Response 200:**
```json
{
  "timestamp": 1700000000000,
  "tps1": 19.98,
  "tps5": 19.95,
  "tps15": 19.91,
  "tickTimeMs": 50.1,
  "memUsedMb": 3200,
  "memTotalMb": 4096,
  "memMaxMb": 8192,
  "uptimeMs": 3600000,
  "cpuPercent": 34.2,
  "sysMemUsedMb": 12000,
  "sysMemTotalMb": 32768,
  "diskUsedGb": 120,
  "diskTotalGb": 500,
  "playerCount": 3,
  "entityCount": 1842,
  "loadedChunks": 441,
  "pingP50": 28,
  "pingP95": 74
}
```

**Field notes:**

| Field | Notes |
|-------|-------|
| `tps1`, `tps5`, `tps15` | Clamped to [0.0, 20.0]. |
| `tickTimeMs` | Rolling average of the last 20 tick times in milliseconds (MSPT). Source: `Server.getTickTimes()` nanoseconds ÷ 1,000,000. |
| `cpuPercent` | `-1.0` if the JVM's `OperatingSystemMXBean.getCpuLoad()` returns a negative value (JVM still warming up, or the container does not expose host CPU). `null` if the MXBean itself could not be cast to `com.sun.management.OperatingSystemMXBean` at all (non-Sun JVMs such as IBM J9). |
| `sysMemUsedMb`, `sysMemTotalMb`, `diskUsedGb`, `diskTotalGb` | `null` if unavailable (same MXBean condition as `cpuPercent`). |
| `pingP50`, `pingP95` | Player ping percentiles in milliseconds. `null` if no players are online or if `Player.getPing()` is unavailable (Spigot before 1.17, or non-Paper forks). P50 is the midpoint of the sorted ping list; P95 is the 95th percentile by index. |
| `playerCount`, `entityCount`, `loadedChunks` | Sampled once per second on the Bukkit main thread. `entityCount` and `loadedChunks` are totals across all loaded worlds. |

### `GET /api/glance/history?window=<minutes>`

Historical metric series. `window` range: 1–525600 (1 year). Default: `5`.

Returns an array of `MetricSnapshot` objects (same schema as `/glance/current`). Resolution is selected automatically:

| `window` | Source | Interval |
|----------|--------|----------|
| ≤ 15 | In-memory ring buffer | 1 second |
| ≤ 60 | SQLite `metrics_1s` | 1 second |
| ≤ 10080 (7d) | SQLite `metrics_1m` | 1 minute |
| > 10080 | SQLite `metrics_15m` | 15 minutes |

The ≤ 15 tier uses the in-memory ring buffer (no disk I/O). The ≤ 60 tier is the same 1-second resolution data read from SQLite, which holds up to 24 hours of raw rows before downsampling.

### `GET /api/glance/gc-events?window=<minutes>`

Returns JVM garbage collection events for the selected Glance window. `window` range: 1-43200 (30 days). Default: `5`.

Events are collected from JVM GC MXBean notifications when the runtime exposes them. When SQLite metrics are enabled, events are persisted and retained for 30 days.

**Response 200:**
```json
[
  {
    "ts": 1700000123456,
    "name": "G1 Young Generation",
    "action": "end of minor GC",
    "cause": "G1 Evacuation Pause",
    "durationMs": 18
  }
]
```

---

## Stats — Player Events

### `GET /api/stats/player-events?minutes=<n>`

Returns player join and leave events for the past `n` minutes. `minutes` range: 1–43200 (30 days). Default: 60.

Events are recorded for every `PlayerJoinEvent` and `PlayerQuitEvent` and persisted to SQLite. Retained for 30 days (pruned nightly).

**Response 200:**
```json
[
  { "ts": 1700000100000, "uuid": "069a79f4-...", "name": "Notch", "action": "join" },
  { "ts": 1700003700000, "uuid": "069a79f4-...", "name": "Notch", "action": "leave" }
]
```

`action` is always `"join"` or `"leave"`. `uuid` is the player's persistent UUID (survives name changes).

---

## Actions

### Categories

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/actions/categories` | — | List all categories |
| `POST` | `/api/actions/categories` | `CreateCategoryRequest` | Create category. Audited. |
| `DELETE` | `/api/actions/categories/{id}` | — | Delete category. Fails on built-in. Audited. |

**`CreateCategoryRequest`:**
```json
{ "name": "Maintenance", "color": "#6366f1" }
```

**Category object:**
```json
{ "id": "maintenance", "name": "Maintenance", "color": "#6366f1", "special": false }
```

The `special: true` flag marks built-in categories (e.g., `quick-actions`) which cannot be deleted.

---

### Snippets

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/actions/snippets` | — | List all snippets |
| `POST` | `/api/actions/snippets` | `CreateSnippetRequest` | Create snippet |
| `PUT` | `/api/actions/snippets/{id}` | `UpdateSnippetRequest` | Update snippet |
| `DELETE` | `/api/actions/snippets/{id}` | — | Delete snippet |
| `POST` | `/api/actions/execute/{snippetId}` | `ExecuteSnippetRequest` | Run snippet now. Audited. |

**`CreateSnippetRequest`:**
```json
{
  "name": "Restart Warning",
  "categoryId": "quick-actions",
  "cmds": ["broadcast §cServer restarting in {minutes} minutes!"]
}
```

`vars` is extracted automatically from `{placeholder}` patterns in `cmds`. You do not need to supply them.

**`ExecuteSnippetRequest`:**
```json
{ "vars": { "minutes": "5" } }
```

**Snippet object:**
```json
{
  "id": "3f2a9c1d-...",
  "name": "Restart Warning",
  "categoryId": "quick-actions",
  "cmds": ["broadcast §cServer restarting in {minutes} minutes!"],
  "vars": ["minutes"]
}
```

---

### Scheduling

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/actions/schedule` | — | List scheduled actions |
| `POST` | `/api/actions/schedule` | `CreateScheduleRequest` | Create scheduled action. Audited. |
| `DELETE` | `/api/actions/schedule/{id}` | — | Remove scheduled action. Audited. |
| `PATCH` | `/api/actions/schedule/{id}/pause` | — | Pause |
| `PATCH` | `/api/actions/schedule/{id}/resume` | — | Resume |

See [actions.md](actions.md) for scheduling modes and cron format.

---

## File Manager

All paths are relative to `files.root` in `config.yml`. Path traversal (`../`) is blocked server-side.

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/files/list` | `?path=` | List directory (dirs first, then alpha) |
| `GET` | `/api/files/read` | `?path=` | Read file text (max 2 MB; binary → 415) |
| `PUT` | `/api/files/write` | `?path=` | Write file (plain text body). Audited. |
| `GET` | `/api/files/download` | `?path=` | Download file as attachment |
| `POST` | `/api/files/upload` | `?path=` multipart | Upload files to directory. Audited. |
| `POST` | `/api/files/upload-chunk` | `?path=&uploadId=&filename=&chunkIndex=&totalChunks=&totalSize=` binary body | Upload one file chunk; server assembles when all chunks arrive. Audited on completion. |
| `DELETE` | `/api/files` | `?path=` | Delete file or directory recursively. Audited. |
| `POST` | `/api/files/mkdir` | `?path=` | Create directory |
| `PATCH` | `/api/files/rename` | — | Move/rename. Body: `{"from":"...","to":"..."}`. Audited. |
| `POST` | `/api/files/copy` | — | Copy file or directory. Body: `{"from":"...","to":"..."}`. Audited. |
| `POST` | `/api/files/fetch` | — | Download URL to server. Body: `{"url":"...","destPath":"...","fileName":"..."}` |

**`FileEntry` object:**
```json
{
  "name": "server.properties",
  "path": "server.properties",
  "isDirectory": false,
  "size": 1842,
  "lastModified": 1700000000000
}
```

---

## Audit Log

### `GET /api/audit`

Query the persistent audit log.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | int (1–500) | Max rows to return. Default: 100. |
| `offset` | int | Pagination offset. Default: 0. |
| `action` | string | Filter by exact action type. |
| `actor` | string | Filter by exact actor name (JWT subject). |
| `since` | long | Unix timestamp ms — return only entries after this time. |

**Response 200:** Array of entries, newest first.
```json
[
  {
    "id": 42,
    "ts": 1700000000000,
    "actor": "Notch",
    "ip": "203.0.113.5",
    "action": "execute_command",
    "detail": "op Herobrine"
  }
]
```

**Action types:**

| Action | Trigger |
|--------|---------|
| `execute_command` | `POST /api/execute` |
| `run_snippet` | `POST /api/actions/execute/{id}` |
| `schedule_create` | `POST /api/actions/schedule` |
| `schedule_delete` | `DELETE /api/actions/schedule/{id}` |
| `category_create` | `POST /api/actions/categories` |
| `category_delete` | `DELETE /api/actions/categories/{id}` |
| `file_write` | `PUT /api/files/write` |
| `file_delete` | `DELETE /api/files` |
| `file_rename` | `PATCH /api/files/rename` |
| `file_copy` | `POST /api/files/copy` |
| `file_upload` | `POST /api/files/upload` |

The `detail` field contains action-specific context: the command run, the snippet name and vars, the file path, etc.
