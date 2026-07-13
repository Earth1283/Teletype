# Teletype

A real-time web admin panel for Paper/Spigot 1.21 servers, and frankly the only one you should be running. It embeds a Ktor HTTP server directly inside the plugin. No sidecar process. No Python daemon babysat by a cron job. No "just SSH in and tail the log like a caveman." One jar. One port. Done.

If your current setup is a Discord bot that runs `screen -r` and prays, we need to talk.

## Features

| Area | What it does |
|------|-------------|
| **Glance** | Live TPS, tick time, JVM heap, host CPU, system RAM, disk — with real anomaly detection (σ-score), not a red/green traffic light some plugin dev slapped on in an afternoon |
| **Stats** | Historical metrics, time-range selector (1h/6h/24h/7d), per-metric charts, Z-score overlay, Pearson correlation table, player join/leave events, click-to-log anomaly lookup. If you've ever squinted at a raw TPS number wondering "is this bad," this replaces the squinting |
| **Console** | Bidirectional WebSocket console — stream logs, send commands, Tab completion, right-click quick actions. Not a read-only log tail pretending to be a console |
| **Actions** | Command snippets with `{variable}` substitution, custom categories, once/n-times/cron scheduling. Stop copy-pasting the same ban command into chat like it's 2013 |
| **Files** | In-browser file manager with Monaco editing, upload, download, rename, delete. Your `config.yml` deserves a real editor, not `nano` over SSH from your phone at 2am |
| **Players** | Live player list, kick/ban, right there |
| **Audit Log** | Every admin action logged with actor and IP, permanently. "Who banned him" is now a solved problem |
| **Auth** | JWT login via in-game `/tty verify`. No shared passwords sitting in a Discord channel for six admins and one leaked account |
| **TLS** | Optional HTTPS, auto-generated self-signed cert or bring your own. Excuses for running this over plaintext are noted and rejected |
| **Network** | HTTP reverse-proxy routing plus raw TCP port forwarding, managed from the panel instead of a nginx.conf nobody remembers editing |
| **Profiling** | JFR-backed always-on rolling buffer, on-demand recordings, in-browser GC/CPU/lock charts, `.jfr` export for Mission Control. When someone says "the server just feels laggy," this is how you stop guessing and start pointing at the exact stack trace responsible |
| **Port Multiplexer** | Share one port between Minecraft traffic and the web panel. Zero firewall changes, zero excuses about "we only have one port open" |

## Quick Start

**Requirements:** Paper 1.21+, Java 21+. That's it. If you're still on Java 8, that's a you problem, not a Teletype problem.

1. Drop `teletype-*.jar` into `plugins/` and restart.
2. Open `http://<server-ip>:8080`. Copy the UUID on screen.
3. In-game as op, or in console, run:
   ```
   /tty verify <uuid>
   ```
4. Browser logs in automatically. No password to forget, no shared secret to leak in a screenshot.

That's the whole setup. No YAML novel to write before it does anything useful. It works out of the box because it should.

## Documentation

| Doc | Contents |
|-----|----------|
| [Installation](docs/installation.md) | Build from source, deploy, first login walkthrough |
| [Configuration](docs/configuration.md) | Full `config.yml` reference — every key, every default |
| [API Reference](docs/api.md) | REST endpoints, WebSocket protocol, auth flow, error format |
| [Actions & Scheduling](docs/actions.md) | Snippets, `{variables}`, categories, cron expressions |
| [Port Multiplexer](docs/multiplexer.md) | How single-port sharing works, setup, limitations |
| [Profiling](docs/profiling.md) | JFR config, API endpoints, event parsing, disk layout |
| [Development](docs/development.md) | Dev setup, `testFrontend` mock server, architecture |

Read them. They exist so you don't have to open an issue asking a question already answered three clicks away.

## Building from Source

```bash
# Build frontend + plugin jar in one step
./gradlew build          # requires Java 21

# Output: build/libs/teletype-*.jar
```

See [docs/installation.md](docs/installation.md) for full build prerequisites.

## License

AGPLv3. Fork it, self-host it, run it for your own server all day. But if you take this, bolt it onto a paid hosting panel, and let people use it over a network without giving them the source — that's exactly the loophole AGPL exists to close. Ship your modifications' source or don't ship at all.
