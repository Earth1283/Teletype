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

### `POST /api/auth/poll/{uuid}`

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

**Server → Client messages:**
```json
{ "type": "log", "payload": "[12:34:56] [Server thread/INFO]: Done (1.234s)!" }
```

On connect, the server replays the last N lines from the replay buffer (default 1000, configurable).

**Client → Server messages:**
```json
{ "type": "command", "payload": "say hello" }
```

Commands execute as the console sender (equivalent to typing in the server console). Output appears as subsequent `log` messages.

Max concurrent connections: 8 (configurable via `server.max-websocket-connections`).

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
  "tps": [19.98, 19.95, 19.91]
}
```

`tps` array: 1-minute, 5-minute, 15-minute averages.

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
    "health": 20.0
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

Rate limited: 30 requests/minute per user (separate from the general API limit).

---

## Glance — Metrics

### `GET /api/glance/current`

Latest metric snapshot.

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
  "diskTotalGb": 500
}
```

`cpuPercent` is `-1` if the JVM cannot read host CPU load (rare; IBM J9, some containers). System metric fields (`cpuPercent`, `sysMemUsedMb`, etc.) are `null` if metrics are not yet available.

### `GET /api/glance/history?window=<minutes>`

Historical metric series. `window` range: 1–525600 (1 year).

Returns an array of snapshots. Resolution is selected automatically:

| `window` | Source | Interval |
|----------|--------|----------|
| ≤ 15 | In-memory | 1 second |
| ≤ 60 | SQLite `metrics_1s` | 1 second |
| ≤ 10080 (7d) | SQLite `metrics_1m` | 1 minute |
| > 10080 | SQLite `metrics_15m` | 15 minutes |

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
| `DELETE` | `/api/files` | `?path=` | Delete file or directory recursively. Audited. |
| `POST` | `/api/files/mkdir` | `?path=` | Create directory |
| `PATCH` | `/api/files/rename` | — | Move/rename. Body: `{"from":"...","to":"..."}`. Audited. |
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
| `file_upload` | `POST /api/files/upload` |

The `detail` field contains action-specific context: the command run, the snippet name and vars, the file path, etc.
