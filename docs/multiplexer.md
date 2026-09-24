# Port Multiplexer

## The Problem

You have a Minecraft server on port 25565. You have a web panel that needs a port. Your hosting provider or firewall allows exactly one port. Normally this ends with a support ticket and a bad afternoon.

The port multiplexer exists so you don't have to have that afternoon.

---

## What It Does

`PortMultiplexer` binds to a single TCP port (default 25565) and routes each incoming connection to either the Minecraft game engine or the Ktor web server — before a single application-level byte is exchanged.

The trick is that all HTTP methods begin with an ASCII letter sequence that Minecraft's handshake packet does not. HTTP says `GET `, `POST`, `PUT `, `HEAD`, etc. Minecraft's handshake packet starts with a VarInt-encoded length, which for any realistic packet length produces a byte between `0x01` and `0x7F` — none of which spell out common English words. The multiplexer reads exactly **4 bytes**, checks the prefix against a hardcoded list of HTTP method tokens, and routes accordingly.

```
Client connects to :25565
          │
          ▼
    Read 4 bytes (peek)
          │
    ┌─────┴──────────────────────┐
    │                            │
"GET ", "POST", "PUT ",        anything else
"DELE", "HEAD", "OPTI",
"PATC", "CONN"
    │                            │
    ▼                            ▼
Ktor web server          Minecraft game server
(internal port)          (internal port +1)
```

Both sides get the 4 peeked bytes prepended back — neither application layer knows the routing happened.

---

## How to Enable It

Set in `config.yml`:

```yaml
server:
  multiplex-game-port: true   # enable the multiplexer
  multiplex-port: 25565       # port the multiplexer binds to
  forward-minecraft-player-addresses: false
```

When `multiplex-game-port: true`, Teletype starts the multiplexer thread pool on the configured port and runs Ktor on an internal port. The Minecraft server runs on `multiplex-port + 1` internally.

### Forwarding Minecraft Player IPs

By default, the internal Minecraft listener sees muxed players as `127.0.0.1` because Teletype opens a local backend socket to the game server. To preserve the real client address, enable:

```yaml
server:
  forward-minecraft-player-addresses: true
```

When enabled, Teletype prepends an HAProxy PROXY protocol v1 header to **Minecraft-bound** connections before replaying the buffered handshake bytes. Paper must also be configured to accept PROXY protocol on the internal Minecraft listener:

```yaml
# config/paper-global.yml
proxies:
  proxy-protocol: true
```

If Paper is not configured for it, players will fail to join because the backend will treat the `PROXY ...` line as invalid Minecraft protocol.

This only affects Minecraft connections routed by the multiplexer. HTTP/Ktor traffic is not given a PROXY preface.

### The First-Start Shuffle

There is a catch. Minecraft's `server.properties` hardcodes the game port. If Teletype finds a port conflict — the multiplexer wants 25565 but the game server already owns it — it patches `server.properties` automatically:

```
server-port=25565  →  server-port=25566
```

...and then prints a warning explaining that two restarts are required. This is not a Teletype limitation; it is the consequence of Minecraft binding its port before plugins load. The first restart patches the file. The second restart starts the game on the patched port and lets the multiplexer take the front-facing one.

If you are setting this up for the first time, save yourself confusion: stop the server, set `server-port=25566` in `server.properties` yourself, enable `multiplex-game-port: true`, and start. That's one restart instead of two.

---

## Implementation Details

For those who enjoy reading about thread pools.

**`PortMultiplexer.kt`** owns a `CachedThreadPool` named `teletype-mux` with daemon threads. Daemon threads don't prevent JVM shutdown — if the server stops, the threads stop, no ceremony required.

Each connection uses two threads: the handler thread copies `target → client` and one pool thread copies `client → target`. When either direction ends, both sockets are closed so neither thread can hang on a half-open connection. `TCP_NODELAY` is set on both sockets so small Minecraft packets aren't delayed by Nagle's algorithm.

The first bytes must arrive within 10 seconds or the connection is dropped, and at most `server.multiplex-max-connections` (default 1024) connections are handled at once. Beyond that, new connections are refused. This stops idle-connection floods on the game port from exhausting server threads.

**Protocol detection:**

| First bytes | Routed to |
|-------------|-----------|
| An HTTP method token (below) | Teletype web panel, or a matching network route |
| `0x16 0x03` (TLS ClientHello) | Teletype's HTTPS port when `server.tls.enabled: true`; otherwise Minecraft |
| Anything else | Minecraft |

**HTTP requests:** The multiplexer reads the full request head (up to 16 KB), then:

- picks the target by the request path. Route prefixes match on path-segment boundaries, so `/map` matches `/map` and `/map/tiles` but not `/mapping`.
- adds an `X-Teletype-Mux-Client` header with the real client IP. Ktor only trusts that header on connections from loopback, so audit entries and per-IP rate limits see real addresses instead of `127.0.0.1`. Any copy of the header sent by the client is stripped.
- sets `Connection: close` (WebSocket upgrades are left alone). Each connection then carries exactly one request, so a browser can't reuse a panel connection for a request that belongs to a different route.

HTTPS connections are relayed as raw TCP, so the multiplexer can't read their path or add the client-IP header. Ktor sees them as coming from `127.0.0.1`.

**Supported HTTP prefix tokens:**

| Token | Method |
|-------|--------|
| `GET ` | GET |
| `POST` | POST |
| `PUT ` | PUT |
| `DELE` | DELETE |
| `HEAD` | HEAD |
| `OPTI` | OPTIONS |
| `PATC` | PATCH |
| `CONN` | CONNECT |

CONNECT is included because some WebSocket upgrade handshakes travel through CONNECT proxies. OPTIONS appears because browsers fire preflight requests before every cross-origin call. You probably won't see either of these in practice, but they're handled.

**Shutdown:** `PortMultiplexer.uninstall()` calls `executor.shutdownNow()` on the thread pool and closes the `ServerSocket`. Existing relays drain naturally; new connections stop being accepted immediately.

---

## Limitations

**TLS termination:** The multiplexer works at the raw TCP layer. TLS connections are spotted by their ClientHello and passed through to Teletype's HTTPS port untouched, so HTTPS routes and client IPs aren't available on that path. For per-route proxying and real client IPs, put a TLS-terminating reverse proxy in front instead and enable `server.trust-proxy-headers`.

**Reserved route prefixes:** Network routes can't use `/`, `/api`, `/ws` or `/assets` (or anything under them), because those would hide the panel itself.

**Minecraft Bedrock:** The multiplexer is TCP-only. Bedrock uses UDP. If you need Bedrock support, Geyser handles that on a separate port and the multiplexer ignores it.

**HAProxy/CDN in front:** If you run HAProxy PROXY protocol in front of Teletype, the first bytes are `PROXY TCP4 ...`, which starts with `P` — but `PROX` is not in the allowed prefix list, so it would route to Minecraft. Don't put inbound HAProxy PROXY protocol in front of the multiplexer. Teletype's `forward-minecraft-player-addresses` setting is different: it emits PROXY protocol from Teletype to the internal Minecraft listener after the mux has already classified the connection.

**Performance:** For a small web panel used by one or two admins, the relay overhead is negligible. For Minecraft game traffic, every packet passes through two extra `InputStream.read()` calls and two threads per connection. This is fine at typical player counts. If you're running 500+ players and are worried about latency, you are almost certainly not running the web panel on a shared game port — disable the multiplexer and open the firewall.

---

## Disabling It

Set `multiplex-game-port: false` (the default). Teletype binds its HTTP server to `server.port` directly and does not touch game traffic. Remember to restore `server-port` in `server.properties` if you modified it.

---

## Summary

| Config | Default | Meaning |
|--------|---------|---------|
| `server.multiplex-game-port` | `false` | Enable single-port mux |
| `server.multiplex-port` | `25565` | Port the mux binds to |
| `server.forward-minecraft-player-addresses` | `false` | Send HAProxy PROXY protocol v1 to Minecraft backend so Paper can see real player IPs |

The game server runs on `multiplex-port + 1` when the mux is active. Ktor runs on an internal port chosen at startup. Clients see one port. The servers see two.

That's it. The rest is just threads and a four-byte peek.
