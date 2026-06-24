# Configuration

Teletype generates `plugins/Teletype/config.yml` on first start. All keys and their defaults are documented below. Reload the plugin after changes (`/tty stop` + `/tty start`, or server restart).

---

## Server

```yaml
server:
  port: 8080                   # HTTP listen port
  https-port: 8443             # HTTPS port (only when tls.enabled: true)
  cors-origins: []             # Parsed but currently unused — CORS always allows all origins (anyHost)
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
  sample-interval-ticks: 20    # Parsed but currently hardcoded — sampler always runs at 20 ticks (1 Hz)
  in-memory-window-seconds: 900  # 15 minutes of 1-second data kept in RAM

  sqlite:
    enabled: true
    flush-interval-seconds: 15   # Parsed but currently hardcoded — ring buffer flushes every 15 seconds

    retention:
      enabled: true
      # Note: the four keys below are parsed but currently hardcoded in RetentionJob.
      # Changing them has no effect on actual retention behavior in this version.
      downsample-1s-after-hours: 24   # Hardcoded: 1s rows older than 24h are averaged → 1m rows at midnight
      downsample-1m-after-days: 7     # Hardcoded: 1m rows older than 7d are averaged → 15m rows at midnight
      delete-15m-after-days: 90       # Not yet implemented — 15m rows are never deleted
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

The retention job runs once per day at midnight (server system timezone). At each run it:

1. Averages 1-second rows from the 24h–48h-ago window → inserts into `metrics_1m`, deletes raw rows.
2. Averages 1-minute rows from the 7d–8d-ago window → inserts into `metrics_15m`, deletes minute rows.
3. Deletes player events older than 30 days.

`metrics_15m` rows are never deleted in the current implementation (`delete-15m-after-days` is not yet enforced).

### Sampled fields

Each snapshot includes: TPS (1/5/15m), mean tick time (MSPT), JVM heap, uptime, host CPU %, system RAM, disk usage, player count, entity count (all worlds), loaded chunks (all worlds), and player ping percentiles (P50/P95). Ping percentiles require Paper 1.17+ (`Player.getPing()` method). On Spigot or older builds these fields are `null`.

### Player events

Join and leave events are stored in a separate `player_events` table in `teletype-metrics.db`. They are independent of the metrics ring buffer — events are never downsampled, only pruned at 30 days. The Stats page plots them as markers on the player count chart and returns them via `GET /api/stats/player-events`.

---

## Actions

```yaml
actions:
  enabled: true
  scheduling-enabled: true       # Allow cron/interval/once scheduling
  quick-actions-category-id: quick-actions  # Category shown in console right-click menu
  max-snippets: 200
  max-scheduled-actions: 50
```

---

## File Manager

```yaml
files:
  enabled: true
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

The `anomaly.*-sigma` values control chart anomaly dot rendering and incident tooltip heuristics. Higher values = only flag more extreme deviations. These are server-side defaults; each browser client can override them in the Settings tab.
