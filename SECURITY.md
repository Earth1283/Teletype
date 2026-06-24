# Security

Teletype is a remote administration panel for a Minecraft server. A logged-in
browser can run console commands, view logs, and, depending on configuration,
manage files, actions, schedules, and network routes.

Treat access to Teletype like access to your server console.

## Plain HTTP Is Not Safe

If you open Teletype at an `http://` URL, the session is not encrypted.

Anyone who can observe or interfere with traffic between your browser and the
host can potentially:

- read the Teletype session token,
- replay that token from another browser,
- see commands, logs, player names, file paths, and file contents,
- change requests in transit, including commands or file operations.

This matters most on cheap hosting panels, shared networks, public Wi-Fi,
school/work networks, VPNs you do not control, or any setup where the Teletype
port is reachable from the public internet.

Do not leave a powerful Teletype panel exposed over public HTTP unless you
understand and accept that risk.

## Self-Signed HTTPS Is Still Better Than HTTP

Teletype can generate a self-signed certificate. Browsers will show a warning
because the certificate is not signed by a public certificate authority.

That warning is annoying, but self-signed HTTPS still provides encryption after
you accept the certificate. It helps protect against passive sniffing and casual
traffic modification on the network.

Self-signed HTTPS is not perfect:

- browsers cannot automatically prove the server identity,
- users may learn to click through certificate warnings,
- a determined attacker may still trick a user with a different certificate.

Even with those limits, self-signed HTTPS is usually safer than plain HTTP for
a remote admin panel.

## Preferred Access Order

Use the safest option your host and skill level support:

1. **Trusted HTTPS from your host or reverse proxy.**
   Use the host-provided `https://` URL when available. If Teletype is behind a
   trusted hosting-panel proxy, enable:

   ```yaml
   server:
     trust-proxy-headers: true
   ```

   Only enable this when direct access to Teletype's HTTP port is blocked by the
   host or firewall. Direct clients can spoof proxy headers.

2. **Teletype self-signed HTTPS.**
   Enable this when your host does not provide a trusted HTTPS frontend:

   ```yaml
   server:
     tls:
       enabled: true
       mode: auto
   ```

   Your browser will warn about the certificate. Verify that you are connecting
   to your own server before accepting the warning.

3. **Plain HTTP on a trusted local network only.**
   This is convenient, but it is not private. Use it only when the browser and
   server are on a network you trust.

4. **Public plain HTTP.**
   Avoid this for always-on administration. If you use it anyway, keep sessions
   short and disable dangerous features you do not need.

## Minimum Hardening Checklist

- Use HTTPS when the panel is reachable outside your own machine.
- Do not share Teletype URLs or session tokens.
- Keep `auth.require-op: true`.
- Keep `auth.disallow-teletype-verify: true`.
- Keep `auth.disallow-player-verify: true` unless you understand the tradeoff.
- Disable file management, scheduled actions, and network routing if you do not
  actively use them.
- Do not expose Teletype to the public internet without understanding that a
  stolen session can become full server control.

## Reporting Vulnerabilities

Please report security issues privately first. Include the affected version,
configuration, reproduction steps, and impact.

Do not publish working exploits for active vulnerabilities before maintainers
have had time to respond.
