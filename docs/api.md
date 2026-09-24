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

Validation problems return `400`, conflicts (existing files, ports in use, a file changed on disk) return `409`, and unexpected server errors return `500` with a generic message — the full stack trace goes to the server console, never to the client. Unknown `/api/...` paths return `404`; every other unknown path serves the panel so client-side routes work.

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

Rate limited: 10 requests/minute per IP (configurable). At most 1000 challenges can be pending at once; beyond that the endpoint returns `429` until older ones expire.

The issued JWT's subject is the name of whoever ran `/tty verify` (a player name, or `CONSOLE`). That name is recorded as the actor on every audit entry the session produces. Run `/tty revoke` to invalidate every issued token at once.

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

### `GET /ws/console`

Bidirectional console stream. Browsers cannot set custom WebSocket headers, so the JWT is sent in the **first message** after the socket opens:

```json
{ "type": "auth", "payload": "<jwt>", "seq": 1234, "epoch": "9d0c…" }
```

`seq` and `epoch` are optional. When a client reconnects it sends back the last `seq`/`epoch` it received and the server only replays lines it hasn't seen yet. If the plugin restarted in between (a different `epoch`), the full replay buffer is sent.

The upgrade is rate limited by its own IP-keyed bucket (20/min). The server pings every 30 seconds and drops connections that miss pongs for 60 seconds. When the token expires, or `/tty revoke` is run, the server closes the socket with code `1008` and reason `Unauthorized`.

**Server → Client messages:**

| `type` | Fields | Description |
|--------|--------|-------------|
| `log_batch` | `payload`: JSON-encoded `string[]`, `seq`, `epoch` | Console output, batched every ~40 ms (max 500 lines per frame). On connect, the replay buffer (default 1000 lines) is sent the same way. Stack traces arrive as one line per frame of the trace. |
| `tab_complete` | `payload`: JSON-encoded `string[]` | Response to a `tab_complete` request. Empty array = no completions. |

**Client → Server messages:**

| `type` | `payload` | Description |
|--------|-----------|-------------|
| `command` | Command string | Execute as console sender. Audited as `console_command`. |
| `tab_complete` | Partial command string | Request tab completions. Server responds with a `tab_complete` message. |

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

### `GET /api/glance/config`

Server-configured Glance thresholds, read live from `config.yml`'s `glance.*` keys (see [Configuration](configuration.md#glance-thresholds)).

**Response 200:**
```json
{
  "tpsNominalMin": 19.0,
  "tpsDegradedMin": 15.0,
  "tickNominalMaxMs": 50,
  "tickDegradedMaxMs": 100,
  "memNominalMaxPct": 65,
  "memDegradedMaxPct": 85,
  "anomalyTpsSigma": 2.0,
  "anomalyTickSigma": 2.0,
  "anomalyMemorySigma": 2.5
}
```

Note: the bundled frontend does not currently call this endpoint — see the note in [Configuration](configuration.md#glance-thresholds).

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

### `GET /api/glance/history?window=<minutes>[&since=<ts>]`

Historical metric series. `window` range: 1–525600 (1 year). Default: `5`.

Returns an array of `MetricSnapshot` objects (same schema as `/glance/current`), oldest first.

| `window` | Source | Resolution |
|----------|--------|------------|
| ≤ `in-memory-window-seconds` (15 min default) | In-memory ring buffer | 1 second |
| ≤ 60 | SQLite, all tiers | Raw rows (1 s where available) |
| > 60 | SQLite, all tiers | Averaged into ~600 buckets |

Every SQLite query reads `metrics_1s`, `metrics_1m` and `metrics_15m` together, so the chart has no gaps however the retention settings are configured.

`since` (Unix ms) returns only snapshots newer than that timestamp. The panel uses it to poll short windows incrementally instead of re-downloading the whole series every couple of seconds.

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

All `/api/actions/*` routes return `403 Forbidden` if `actions.enabled: false` in `config.yml`. `POST /api/actions/snippets` returns `400` once `actions.max-snippets` is reached; `POST /api/actions/schedule` and `PATCH /api/actions/schedule/{id}/resume` return `403` if `actions.scheduling-enabled: false`, and `POST /api/actions/schedule` returns `400` once `actions.max-scheduled-actions` is reached.

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
| `PATCH` | `/api/actions/schedule/{id}/pause` | — | Pause. Audited. |
| `PATCH` | `/api/actions/schedule/{id}/resume` | — | Resume. Audited. |

See [actions.md](actions.md) for scheduling modes and cron format.

---

## File Manager

All paths are relative to `files.root` in `config.yml`. Paths are canonicalized server-side, so `../` traversal and symlinks pointing outside the root are rejected with `403`. The root folder itself can never be deleted, renamed or overwritten. All `/api/files/*` routes return `403 Forbidden` if `files.enabled: false`.

Writes (editor saves, uploads, chunk assembly, fetches) go to a temp file first and are then renamed into place, so an interrupted write never leaves a truncated file.

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/files/list` | `?path=` | List directory (dirs first, then alpha) |
| `GET` | `/api/files/read` | `?path=` | Read file text (limit: `files.max-edit-size-mb`; binary → 415). Returns the file's modification time in the `X-Last-Modified` header. |
| `PUT` | `/api/files/write` | `?path=&expectedLastModified=` | Write file (plain text body). Same size and extension limits as `read`. If `expectedLastModified` is given and the file changed on disk since, returns `409`. Returns the new `X-Last-Modified`. Audited. |
| `GET` | `/api/files/download` | `?path=` | Download file as attachment (requires the `Authorization` header) |
| `POST` | `/api/files/download-token` | `?path=` | Returns `{"token","url"}` — a single-use link valid for 60 seconds that downloads the file without an `Authorization` header, so the browser can stream it straight to disk. Audited as `file_download`. |
| `POST` | `/api/files/upload` | `?path=&overwrite=` multipart | Upload files to directory. Existing files are skipped unless `overwrite=true`; if every file was skipped the response is `409`. Audited. |
| `POST` | `/api/files/upload-chunk` | `?path=&uploadId=&filename=&chunkIndex=&totalChunks=&totalSize=&overwrite=` binary body | Upload one file chunk; server assembles when all chunks arrive. `409` if the target exists and `overwrite` isn't `true`. Chunks of uploads abandoned for 24 hours are cleaned up automatically. Audited on completion. |
| `DELETE` | `/api/files` | `?path=` | Delete file or directory recursively. Audited. |
| `POST` | `/api/files/mkdir` | `?path=` | Create directory. Audited. |
| `PATCH` | `/api/files/rename` | — | Move/rename. Body: `{"from":"...","to":"..."}`. Audited. |
| `POST` | `/api/files/copy` | — | Copy file or directory. Body: `{"from":"...","to":"..."}`. Audited. |
| `GET` | `/api/files/search` | `?q=&scope=local\|global&path=&fuzzyLevel=` | Name search. Does not follow symlinked folders and stops after 50,000 entries / 200 results. |
| `POST` | `/api/files/fetch` | — | Download a URL to the server. Body: `{"url":"...","destPath":"...","fileName":"..."}`. Only public `http(s)` URLs are accepted — `file:`, localhost, private/LAN, link-local and cloud-metadata addresses are refused, including after redirects. Size limit: `files.max-fetch-size-mb`. `409` if the target file exists. Audited. |
| `POST` | `/api/files/decompress` | — | Extract a `.zip`/`.tar.gz` archive. Body: `{"path":"...","destPath":"..."}`. Audited. |

### `GET /api/download/{token}`

Redeems a download token from `/api/files/download-token` or `/api/profiling/recording/{id}/download-token`. No `Authorization` header needed; each token works once.

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
| `auth_verify` | `/tty verify` approved a web login (IP = the browser's address) |
| `auth_revoke_all` | `/tty revoke` |
| `execute_command` | `POST /api/execute` |
| `console_command` | `command` message on `/ws/console` |
| `server_restart` | `POST /api/system/restart` |
| `run_snippet` | `POST /api/actions/execute/{id}` |
| `snippet_create` / `snippet_update` / `snippet_delete` | Snippet CRUD (deleting a snippet also removes its schedules) |
| `schedule_create` / `schedule_delete` / `schedule_pause` / `schedule_resume` | Schedule changes |
| `category_create` / `category_delete` | Category changes |
| `file_write` / `file_delete` / `file_rename` / `file_copy` / `file_upload` / `file_mkdir` / `file_decompress` | File manager changes |
| `file_fetch` | `POST /api/files/fetch` |
| `file_download` | Download token issued |
| `network_route_*` / `network_forward_*` | Route and port-forward create/update/delete |
| `profiling_*` | Continuous start/stop, dumps, recording start/stop/delete |

The `detail` field contains action-specific context: the command run, the snippet name and vars, the file path, etc.
