# Installation

## Requirements

| Requirement | Minimum |
|-------------|---------|
| Minecraft server | Paper 1.21+ (Spigot works; Paper recommended) |
| Java | 21 |
| Build (source only) | JDK 21, Node.js 18+, npm |

---

## Install Pre-Built JAR

1. Download `teletype-*.jar` from releases.
2. Copy to `plugins/` in your server directory.
3. Start or restart the server.
4. Teletype logs its port on startup:
   ```
   [Teletype] Web server started — http://localhost:8080
   ```

---

## Build from Source

```bash
git clone https://github.com/Earth1283/Teletype.git
cd Teletype

# Build frontend assets first (requires Node 18+)
cd frontend && npm install && npm run build && cd ..

# Build the plugin JAR (requires Java 21)
./gradlew build
```

The shaded JAR is at `build/libs/teletype-<version>.jar`. Copy it to `plugins/`.

> **macOS with multiple JDKs:** If `java` is not Java 21, prefix Gradle commands with your Java 21 path or use the `java_21` alias if configured:
> ```bash
> zsh -ic "java_21 && ./gradlew build"
> ```

---

## First Login

1. **Open the panel** — navigate to `http://<server-ip>:8080` in your browser. The auth screen displays a UUID.

   If your host gives you an `https://` web-panel URL for plugin ports, use that
   URL instead. Set `server.trust-proxy-headers: true` only when the host blocks
   direct access to Teletype's HTTP port and sends proxy headers.

2. **Verify in-game or in console** — as an op, run:
   ```
   /tty verify <uuid>
   ```
   The UUID is valid for 5 minutes (configurable via `auth.challenge-ttl-seconds`).

3. **Done** — the browser receives a 24-hour JWT and loads the dashboard.

### Multiple admins

Each admin goes through the same flow independently, and each gets their own JWT named after whoever ran `/tty verify`, so the audit log shows who did what. There is no shared password. To revoke all sessions at once, run `/tty revoke` from the console or in-game. It rotates `auth.jwt-secret` and disconnects every open panel.

### `require-op`

By default, players need to be operators to use the admin subcommands (`verify`, `start`, `stop`, `reload`, `doctor`, `revoke`). With `auth.require-op: false`, anyone with the `teletype.admin` permission can use them, so you can grant it through a permissions plugin without opping. The console can always use them. Even with operator rights, in-game `verify` is still limited by `auth.disallow-player-verify` (see [configuration.md](configuration.md#authentication)).

---

## Commands

`/tty` (aliases `/teletype`, `/teletypewriter`) with no arguments, or `/tty help`, prints the list below in chat. Each entry is clickable: clicking fills the command into your chat box. `/tty help <command>` explains a single command. Typos get a "did you mean" suggestion, and tab completion only offers the subcommands you're allowed to run.

| Command | What it does |
|---------|--------------|
| `/tty help [command]` | Show all commands, or details for one |
| `/tty status` | Whether the web panel is running, and on which port |
| `/tty verify <code>` | Approve a web login using the code shown in the browser |
| `/tty start` / `/tty stop` | Start or stop the embedded web server |
| `/tty reload` | Re-read `config.yml` and `messages.yml` and restart the web server |
| `/tty doctor` | Health check: ports, TLS, web assets, secrets, data files |
| `/tty revoke` | Log out every web session (rotates the JWT secret) |

All help text is in `messages.yml` under `command.help`, so it can be translated or reworded.

---

## Upgrading

Stop the server, replace the JAR, restart. Teletype stores its data in `plugins/Teletype/`:

| File | Contents |
|------|----------|
| `config.yml` | Configuration (never overwritten on upgrade) |
| `teletype-metrics.db` | SQLite metrics history |
| `teletype-audit.db` | SQLite audit log |
| `schedule.json` | Persisted scheduled actions |
| `keystore.jks` | TLS keystore (if TLS auto-mode) |

New config keys added in upgrades get their default values automatically — existing keys are preserved.

---

## Uninstalling

Remove `teletype-*.jar` from `plugins/`. To also remove data:
```bash
rm -rf plugins/Teletype/
```
