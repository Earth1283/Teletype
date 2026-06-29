# Teletype

A real-time web administration panel for Paper/Spigot 1.21 Minecraft servers. Embeds a Ktor HTTP server directly in the plugin — no separate process, no external dependencies at runtime.

## Features

| Area | What it does |
|------|-------------|
| **Glance** | Live TPS, tick time, JVM heap, host CPU, system RAM, disk — with anomaly detection (σ-score) and chart-to-log correlation |
| **Stats** | Historical metrics with time-range selector (1h/6h/24h/7d); per-metric charts; Z-score overlay; Pearson correlation table; player join/leave events; click-anomaly log lookup |
| **Console** | Bidirectional WebSocket console: stream logs, send commands, Tab completion, right-click quick actions |
| **Actions** | Command snippets with `{variable}` substitution, custom categories, once/n-times/cron scheduling |
| **Files** | In-browser file manager — browse, edit (Monaco), upload, download, rename, delete |
| **Players** | Live player list with kick/ban |
| **Audit Log** | Persistent record of every admin action (command, file edit, snippet run, schedule) with actor + IP |
| **Auth** | JWT-based login via in-game `/tty verify` — no shared passwords |
| **TLS** | Optional HTTPS with auto-generated self-signed cert or bring-your-own keystore |
| **Network** | HTTP reverse-proxy routing by URL prefix + raw TCP port forwarding, managed from the web panel |
| **Profiling** | JFR-backed always-on rolling buffer (configurable disk/age limits), manual on-demand recordings, in-browser GC/CPU/lock event charts, `.jfr` download for JDK Mission Control |
| **Port Multiplexer** | Share a single port between Minecraft game traffic and the web panel — optional, zero firewall changes |

## Quick Start

**Requirements:** Paper 1.21+, Java 21+

1. Drop `teletype-*.jar` into your server's `plugins/` folder and restart.
2. Open `http://<server-ip>:8080` in your browser. Copy the UUID shown on screen.
3. In-game (as an op) or in the server console, run:
   ```
   /tty verify <uuid>
   ```
4. The browser logs in automatically. Done.

The web panel is now live. No further configuration required.

## Documentation

| Doc | Contents |
|-----|----------|
| [Installation](docs/installation.md) | Build from source, deploy, first login walkthrough |
| [Configuration](docs/configuration.md) | Full `config.yml` reference — all keys and defaults |
| [API Reference](docs/api.md) | REST endpoints, WebSocket protocol, auth flow, error format |
| [Actions & Scheduling](docs/actions.md) | Snippets, `{variables}`, categories, cron expressions |
| [Port Multiplexer](docs/multiplexer.md) | How single-port sharing works, setup, limitations |
| [Profiling](docs/profiling.md) | JFR config, API endpoints, event parsing, disk layout |
| [Development](docs/development.md) | Dev setup, `testFrontend` mock server, architecture |

## Building from Source

```bash
# Build frontend + plugin jar in one step
./gradlew build          # requires Java 21

# Output: build/libs/teletype-*.jar
```

See [docs/installation.md](docs/installation.md) for full build prerequisites.

## License

MIT
