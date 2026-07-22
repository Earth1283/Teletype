# Profiling

Teletype integrates **Java Flight Recorder (JFR)** to give admins deep visibility into JVM performance. JFR is built into HotSpot JDK 9+ with no extra jars, commercial flags, or restarts required.

## Overview

The Profiling sidebar section provides:

- **Always-on rolling buffer** — a continuous recording that keeps the last N MB / N seconds of event data in a disk-backed rolling window
- **Crash protection** — the buffer is dumped to `profiling/dumps/exit-dump.jfr` on JVM exit, capturing events leading up to a crash
- **Manual recordings** — start named on-demand recordings with custom duration/size limits for targeted diagnosis
- **In-browser event summary** — parsed GC pauses, CPU load chart, lock contention table, heap & thread stats
- **Download** — export any recording as a raw `.jfr` file for use in JDK Mission Control or IntelliJ Profiler

## Configuration (`config.yml`)

```yaml
profiling:
  enabled: true            # false = /api/profiling/* returns 403 Forbidden entirely

  continuous:
    enabled: true
    max-disk-mb: 256        # Rolling buffer disk cap
    max-age-sec: 3600       # Rolling time window (1 hour)
    template: "default"     # "default" (<1% overhead) or "profile" (~2-5%, richer data)
    dump-on-exit: true      # Auto-dump buffer when the JVM shuts down or crashes
    output-dir: "profiling/dumps"

  recordings:
    output-dir: "profiling/recordings"
    max-total-disk-mb: 512  # Auto-evict oldest recordings when cap exceeded
```

All paths are relative to the plugin data folder (`plugins/Teletype/`). Parent directories are created automatically.

## API Endpoints

All endpoints require JWT authentication (same as all other `/api` routes), and all return `403 Forbidden` if `profiling.enabled: false`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/profiling/status` | JFR availability, continuous recording state, config |
| `GET` | `/api/profiling/recordings` | List all saved recordings |
| `POST` | `/api/profiling/continuous/start` | Start/restart continuous recording with optional overrides |
| `POST` | `/api/profiling/continuous/stop` | Stop continuous recording |
| `POST` | `/api/profiling/continuous/dump` | Snapshot rolling buffer to disk now |
| `POST` | `/api/profiling/recording/start` | Start a named manual recording |
| `POST` | `/api/profiling/recording/{id}/stop` | Stop a running manual recording |
| `DELETE` | `/api/profiling/recording/{id}` | Delete a recording and its file |
| `GET` | `/api/profiling/recording/{id}/download` | Download raw `.jfr` file |
| `GET` | `/api/profiling/recording/{id}/events` | Parsed event summary (GC, CPU, locks, heap) |

### `POST /api/profiling/continuous/start` body (all fields optional)

```json
{
  "maxDiskMb": 256,
  "maxAgeSec": 3600,
  "template": "default",
  "dumpOnExit": true
}
```

### `POST /api/profiling/recording/start` body

```json
{
  "name": "lag-investigation",
  "template": "profile",
  "maxDurationSec": 120,
  "maxSizeMb": 64
}
```

`maxDurationSec` and `maxSizeMb` default to 0 (no limit).

## Event Parsing

When "View Events" is clicked, the backend parses the `.jfr` file using `jdk.jfr.consumer.RecordingFile` and returns:

| Field | JFR event type | Details |
|-------|---------------|---------|
| `gcPauses` | `jdk.GarbageCollection` | Start time, duration, cause — up to 2000 events |
| `cpuSamples` | `jdk.CPULoad` | System CPU %, JVM user % — up to 3600 samples |
| `topLocks` | `jdk.JavaMonitorEnter` | Top 20 contended classes by total blocked ms |
| `heapSummary` | `jdk.GCHeapSummary` | Last observed heap used/reserved |
| `threadCount` | `jdk.JavaThreadStatistics` | Peak active thread count |

Parse results are cached in memory per recording ID (cleared on recording deletion).

## JFR Templates

| Template | Overhead | Use case |
|----------|----------|----------|
| `default` | < 1% | Always-on continuous recording |
| `profile` | ~2–5% | Short targeted investigations |

## JVM Requirements

JFR is available on **HotSpot JDK 9+** (no commercial flags needed since JDK 11). If JFR is unavailable (non-HotSpot JVM), the Profiling tab shows an "unavailable" banner and all recording endpoints return `503 Service Unavailable`. No startup errors are thrown.

## Disk Layout

```
plugins/Teletype/
├── profiling/
│   ├── dumps/
│   │   ├── exit-dump.jfr          # Overwritten each JVM exit
│   │   └── dump-<timestamp>.jfr   # Manual buffer dumps
│   └── recordings/
│       └── <name>.jfr             # Named manual recordings
```

The `max-total-disk-mb` cap applies only to recordings in the `recordings/` directory. Continuous dumps are managed by JFR's own rolling policy (`max-disk-mb`).
