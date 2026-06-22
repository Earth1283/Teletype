# Configuration

Teletype generates `plugins/Teletype/config.yml` on first start. All keys and their defaults are documented below. Reload the plugin after changes (`/tty stop` + `/tty start`, or server restart).

---

## Server

```yaml
server:
  port: 8080                   # HTTP listen port
  https-port: 8443             # HTTPS port (only when tls.enabled: true)
  cors-origins: []             # Allowed CORS origins. Empty list = allow all (*)
  max-websocket-connections: 8 # Max simultaneous authenticated WebSocket clients
```

`cors-origins` example for a specific origin:
```yaml
cors-origins:
  - "https://my.panel.example.com"
```

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

---

## Rate Limiting

```yaml
rate-limit:
  enabled: true
  auth:
    requests-per-minute: 10    # Per source IP on /api/auth/* (brute-force protection)
  api:
    requests-per-minute: 300   # Per authenticated user (JWT subject) on all other /api/* routes
  execute:
    requests-per-minute: 30    # Tighter sublimit for POST /api/execute (command dispatch)
```

Set `enabled: false` to disable all rate limiting (development only).

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
  sample-interval-ticks: 20    # 20 ticks = 1 Hz. Runs on the Bukkit main thread.
  in-memory-window-seconds: 900  # 15 minutes of 1-second data kept in RAM

  sqlite:
    enabled: true
    flush-interval-seconds: 15   # How often the ring buffer is written to disk

    retention:
      enabled: true
      downsample-1s-after-hours: 24   # After 24h, 1s rows are averaged → 1m rows
      downsample-1m-after-days: 7     # After 7d, 1m rows are averaged → 15m rows
      delete-15m-after-days: 90       # After 90d, 15m rows are deleted
```

### Resolution tiers

| Window requested | Table used | Row interval |
|-----------------|------------|-------------|
| ≤ 15 minutes | In-memory ring buffer | 1 second |
| ≤ 60 minutes | `metrics_1s` | 1 second |
| ≤ 7 days | `metrics_1m` | 1 minute |
| > 7 days | `metrics_15m` | 15 minutes |

The frontend automatically selects the appropriate window tier.

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
