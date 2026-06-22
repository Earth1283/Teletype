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

2. **Verify in-game or in console** — as an op, run:
   ```
   /tty verify <uuid>
   ```
   The UUID is valid for 5 minutes (configurable via `auth.challenge-ttl-seconds`).

3. **Done** — the browser receives a 24-hour JWT and loads the dashboard.

### Multiple admins

Each admin goes through the same flow independently — each gets their own JWT. There is no shared password. To revoke all sessions, change `auth.jwt-secret` in `config.yml` and reload the plugin.

### `require-op`

By default only operators can verify. Set `auth.require-op: false` to allow any player to authenticate (not recommended for public servers).

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
