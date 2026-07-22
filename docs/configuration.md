# Configuration

Teletype generates `plugins/Teletype/config.yml` on first start. All keys and their defaults are documented below. Reload the plugin after changes (`/tty stop` + `/tty start`, or server restart).

---

## Server

```yaml
server:
  port: 8080                   # HTTP listen port
  https-port: 8443             # HTTPS port (only when tls.enabled: true)
  cors-origins: []             # Empty = allow any origin (anyHost). Non-empty = only listed origins are allowed.
  max-websocket-connections: 8 # Max simultaneous authenticated WebSocket clients
  trust-proxy-headers: false   # Trust HTTPS/client IP headers from a hosting panel proxy

  # Port multiplexer — share one port between the web panel and Minecraft game traffic
  multiplex-game-port: false   # Enable single-port mux (see docs/multiplexer.md)
  multiplex-port: 25565        # Port the mux binds to when enabled
  forward-minecraft-player-addresses: false # Send HAProxy PROXY protocol to Minecraft backend
```

`cors-origins` example for a specific origin:
```yaml
cors-origins:
  - "https://my.panel.example.com"
```

### Port Multiplexer

When `multiplex-game-port: true`, Teletype binds to `multiplex-port` and routes traffic:
- HTTP/HTTPS (browser) → Ktor web server (internal port)
- Minecraft protocol → game server (`multiplex-port + 1` internally)

The routing decision is made by peeking the first 4 bytes. If they match an HTTP method prefix, the connection goes to Ktor. Otherwise it goes to Minecraft. No firewall rule changes needed.

**First-time setup:** If Minecraft already owns `multiplex-port` when the multiplexer starts, Teletype patches `server.properties` (`server-port=N` → `server-port=N+1`) and prints a warning. Two restarts are required. To avoid this, set `server-port` in `server.properties` to `multiplex-port + 1` before enabling the mux.

**Player IP forwarding:** Enable `forward-minecraft-player-addresses` only after Paper is configured to accept HAProxy PROXY protocol on the internal Minecraft listener. In `config/paper-global.yml`, set `proxies.proxy-protocol: true`. Without that backend setting, Minecraft will reject the prefixed connection.

See [Port Multiplexer](multiplexer.md) for full details and limitations.

---

## TLS

```yaml
server:
  tls:
    enabled: false             # Enable HTTPS
    mode: auto                 # auto | keystore
    http-redirect: true        # Redirect HTTP → HTTPS when TLS is on
    key-alias: teletype

    # keystore mode only:
    keystore-path: ""          # Path relative to plugins/Teletype/
    keystore-password: ""
    key-password: ""
```

### `mode: auto`
Teletype generates a self-signed certificate at `plugins/Teletype/keystore.jks` on first start. Browsers will warn about the self-signed cert.

### `mode: keystore`
Provide a PKCS12 or JKS keystore signed by a real CA. Set `keystore-path`, `keystore-password`, and `key-password`.

## Hosted Panel / Reverse Proxy HTTPS

Some hosts expose plugin web ports through their own trusted HTTPS proxy. In
that setup Teletype still listens on plain HTTP internally, but the browser sees
a normal `https://` address from the host and does not show a certificate
warning.

If your host provides that setup, set:

```yaml
server:
  trust-proxy-headers: true
```

This makes Teletype honor `Forwarded` and `X-Forwarded-*` headers such as
`X-Forwarded-Proto: https`.

Only enable this when direct access to Teletype's HTTP port is blocked by the
host or firewall. If clients can connect directly, they can spoof these headers.

---

## Rate Limiting

```yaml
rate-limit:
  enabled: true
  auth:
    requests-per-minute: 10    # Per source IP on /api/auth/* (brute-force protection)
  api:
    requests-per-minute: 300   # Per source IP on all authenticated /api/* routes
  execute:
    requests-per-minute: 30    # Tighter sublimit for POST /api/execute (command dispatch)
```

Set `enabled: false` to disable all rate limiting (development only).

**Rate limiting order:** The spam check runs before JWT verification on every route. A blocked IP never reaches authentication logic. This is intentional — validating a JWT is non-trivial and there is no reason to do it for a client that's already over limit.

---

## Authentication

```yaml
auth:
  jwt-secret: ""               # Auto-generated 64-char hex on first start. Changing this invalidates all active sessions.
  jwt-expiry-minutes: 1440     # 24 hours. Set 0 for non-expiring tokens.
  challenge-ttl-seconds: 300   # How long a /tty verify UUID stays valid (5 minutes)
  require-op: true             # If true, only /op players can run /tty verify
```

> **Security note:** The `jwt-secret` is stored in plaintext in `config.yml`. Restrict file read access on the server.

Expired challenges are swept every 30 seconds, so with a very small `challenge-ttl-seconds` a challenge may remain pollable for up to ~30 extra seconds past the configured TTL before it's actually removed.

---

## Console

```yaml
console:
  enabled: true
  replay-buffer-lines: 1000    # Lines sent to a new WebSocket client on connect
  max-line-length: 2048        # Truncate longer lines. 0 = unlimited.
```

---

## Metrics

```yaml
metrics:
  enabled: true
  sample-interval-ticks: 20    # Sampler cadence in server ticks (20 = 1 Hz)
  in-memory-window-seconds: 900  # 15 minutes of 1-second data kept in RAM

  sqlite:
    enabled: true
    flush-interval-seconds: 15   # How often the sample buffer is flushed to SQLite

    retention:
      enabled: true                   # Master switch for the nightly retention job. false = rows accumulate forever.
      downsample-1s-after-hours: 24    # 1s rows older than this are averaged → 1m rows, raw rows deleted
      downsample-1m-after-days: 7      # 1m rows older than this are averaged → 15m rows, minute rows deleted
      delete-15m-after-days: 90        # 15m rows older than this are deleted outright
      player-events-days: 30          # Hardcoded: player join/leave events pruned at 30 days
```

### Resolution tiers

| Window requested | Table used | Row interval |
|-----------------|------------|-------------|
| ≤ 15 minutes | In-memory ring buffer | 1 second |
| ≤ 60 minutes | SQLite `metrics_1s` | 1 second |
| ≤ 7 days | SQLite `metrics_1m` | 1 minute |
| > 7 days | SQLite `metrics_15m` | 15 minutes |

The ≤ 15 minute window is served entirely from RAM. Windows from 16–60 minutes read the same 1-second data from SQLite. The frontend automatically selects the appropriate tier.

### Retention schedule

Set `metrics.sqlite.retention.enabled: false` to disable the job entirely — all three tables then keep every row forever (1s rows grow at roughly 86 KB/day).

When enabled, the job runs once per day at midnight (server system timezone). Each of the three retention keys is read fresh from `config.yml` on every run, so changing them takes effect the next time the job fires (no restart needed) — although reload only picks up config edits made via `/tty stop` + `/tty start` or a full restart, per the note at the top of this doc. At each run it:

1. Averages 1-second rows older than `downsample-1s-after-hours` (default 48h) into `metrics_1m`, deletes the source raw rows. The averaged window is exactly the one day of rows that crossed the threshold since the previous run.
2. Averages 1-minute rows older than `downsample-1m-after-days` (default 7d) into `metrics_15m`, deletes the source minute rows, same one-day-wide window logic.
3. Deletes `metrics_15m` rows older than `delete-15m-after-days` (default 90d). Set to `0` to keep 15-minute rows forever.
4. Deletes player events and GC events older than 30 days (fixed, not configurable).

### Sampled fields

Each snapshot includes: TPS (1/5/15m), mean tick time (MSPT), JVM heap, uptime, host CPU %, system RAM, disk usage, player count, entity count (all worlds), loaded chunks (all worlds), and player ping percentiles (P50/P95). Ping percentiles require Paper 1.17+ (`Player.getPing()` method). On Spigot or older builds these fields are `null`.

### Player events

Join and leave events are stored in a separate `player_events` table in `teletype-metrics.db`. They are independent of the metrics ring buffer — events are never downsampled, only pruned at 30 days. The Stats page plots them as markers on the player count chart and returns them via `GET /api/stats/player-events`.

---

## Actions

```yaml
actions:
  enabled: true                  # false = /api/actions/* returns 403 Forbidden entirely
  scheduling-enabled: true       # false = schedule creation/resume rejected with 403; existing schedules stop firing (paused, not deleted)
  quick-actions-category-id: quick-actions  # Category shown in console right-click menu
  max-snippets: 200              # POST /api/actions/snippets returns 400 once this many snippets exist
  max-scheduled-actions: 50      # POST /api/actions/schedule returns 400 once this many scheduled actions exist
```

When `scheduling-enabled` is `false`, snippets that were already scheduled stay stored (nothing is deleted) but their underlying Bukkit task is never armed — `startAll()` on plugin load, and `resume()` via the API, both no-op silently until the flag is turned back on.

---

## File Manager

```yaml
files:
  enabled: true                  # false = /api/files/* returns 403 Forbidden entirely
  root: "."                      # Root directory exposed. Relative to server working directory.
  max-edit-size-mb: 4            # Files larger than this open as download-only in the editor
  editable-extensions: []        # Restrict editable extensions. Empty = auto-detect text files.
```

### Path security

All file operations canonicalize the requested path and verify it falls within `files.root`. Requests that would escape the root (e.g., `../../etc/passwd`) are rejected with `403 Forbidden`. This check cannot be disabled.

### `editable-extensions` example

```yaml
editable-extensions:
  - yml
  - yaml
  - json
  - properties
  - txt
  - sh
```

---

## Glance Thresholds

Controls when the status badge flips to DEGRADED or INCIDENT and when stat cards turn amber/red.

```yaml
glance:
  tps:
    nominal-min: 19.0     # TPS ≥ this → green
    degraded-min: 15.0    # TPS ≥ this → amber; below → red

  tick-time:
    nominal-max-ms: 50    # Tick ≤ this → green
    degraded-max-ms: 100  # Tick ≤ this → amber; above → red

  memory:
    nominal-max-pct: 65   # JVM heap % ≤ this → blue
    degraded-max-pct: 85  # JVM heap % ≤ this → amber; above → red

  anomaly:
    tps-sigma: 2.0        # Z-score threshold for TPS anomaly dots on charts
    tick-sigma: 2.0
    memory-sigma: 2.5
```

The `anomaly.*-sigma` values are intended to control chart anomaly dot rendering and incident tooltip heuristics, with `tps`/`tick-time`/`memory` intended to control the Glance status badge and stat-card colors. Higher sigma values = only flag more extreme deviations.

**Current state:** these nine values are served by the backend at `GET /api/glance/config` (see [API Reference](api.md)), but the bundled frontend does not call that endpoint yet — `GlancePage.tsx` and `SettingsContext.tsx` still use their own hardcoded defaults (19/15 TPS, 50/100ms tick, 65/85% memory, 2.0/2.0/2.5 sigma) independent of whatever is in `config.yml`. Changing these keys today has no visible effect in the shipped UI; the backend contract is in place for a future frontend change to fetch `/api/glance/config` on load and seed the Settings defaults from it (while still letting per-browser Settings overrides win, same as the sigma sliders already do).
