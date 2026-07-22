# Actions & Scheduling

Actions let you save multi-command sequences, parametrize them with variables, and run them on demand or on a schedule — all from the browser.

---

## Snippets

A snippet is a named group of one or more Minecraft console commands.

```
name:        "Restart Warning"
category:    Quick Actions
commands:
  - broadcast §cServer restarting in {minutes} minutes!
  - broadcast §cPlease finish what you are doing.
```

### Variable substitution

Any `{word}` token in a command becomes a variable. When you run a snippet manually, the UI prompts for each variable's value. When running via the API, pass `vars` in the request body.

```
kick {player} {reason}
→ vars: ["player", "reason"]
```

Variables are case-sensitive. The same variable name used in multiple commands gets one prompt.

### Quick Actions

Snippets in the **Quick Actions** category appear in the console right-click context menu. Right-click any log line → **Quick Actions** → pick a snippet. Snippets with no variables run immediately; snippets with variables open a fill-in dialog first.

The Quick Actions category ID is `quick-actions` and cannot be deleted. The category shown in the right-click menu is configurable via `actions.quick-actions-category-id` in `config.yml`.

---

## Categories

Categories are labels with a hex color used to organize snippets. Create and delete custom categories freely. The built-in **Quick Actions** category (`special: true`) cannot be deleted.

---

## Scheduling

Snippets can be scheduled to run automatically. Three modes are available:

### `once` — run once, after a delay

Runs the snippet a single time at a specified future timestamp.

```json
{
  "snippetId": "s1",
  "label": "One-off restart",
  "mode": "once",
  "trigger": "once",
  "runAt": 1700000000000
}
```

`runAt` is a Unix timestamp in milliseconds. The scheduled action is deleted after it fires.

### `ntimes` — run N times, on an interval

Runs the snippet a fixed number of times, separated by a regular interval.

```json
{
  "snippetId": "s1",
  "label": "Repeat 3x",
  "mode": "ntimes",
  "trigger": "interval",
  "intervalMs": 60000,
  "repeatCount": 3
}
```

`intervalMs`: milliseconds between executions. `repeatCount`: total number of times to run. The action is deleted after `repeatCount` executions.

### `repeat` — run forever, on interval or cron

Runs the snippet indefinitely until paused or deleted.

**Interval trigger:**
```json
{
  "snippetId": "s1",
  "label": "Hourly save",
  "mode": "repeat",
  "trigger": "interval",
  "intervalMs": 3600000
}
```

**Cron trigger:**
```json
{
  "snippetId": "s1",
  "label": "Nightly restart warning",
  "mode": "repeat",
  "trigger": "cron",
  "cronExpr": "0 55 23 * * *"
}
```

---

## Cron Expressions

Teletype uses a **6-field** cron format (seconds included):

```
┌───── second (0–59)
│ ┌──── minute (0–59)
│ │ ┌─── hour (0–23)
│ │ │ ┌── day of month (1–31)
│ │ │ │ ┌─ month (1–12)
│ │ │ │ │ ┌ day of week (0–7, 0 and 7 = Sunday)
│ │ │ │ │ │
* * * * * *
```

### Examples

| Expression | Meaning |
|------------|---------|
| `0 0 * * * *` | Every hour, on the hour |
| `0 */30 * * * *` | Every 30 minutes |
| `0 55 23 * * *` | Every night at 23:55:00 |
| `0 0 8 * * 1` | Every Monday at 08:00:00 |
| `0 0 12 1 * *` | First of every month at noon |
| `*/30 * * * * *` | Every 30 seconds |

### Supported syntax

| Token | Meaning |
|-------|---------|
| `*` | Every value |
| `5` | Exact value |
| `1-5` | Range (inclusive) |
| `*/15` | Step — every 15th value |
| `1,15,30` | List |

Cron expressions are evaluated in the JVM's system timezone. Validation happens on save; invalid expressions are rejected with `400 Bad Request`.

---

## Pause and Resume

Any scheduled action can be paused and resumed without losing its state. A paused action skips execution until resumed — it does not "catch up" on missed runs.

```
PATCH /api/actions/schedule/{id}/pause
PATCH /api/actions/schedule/{id}/resume
```

---

## Limits

| Limit | Default | Config key |
|-------|---------|------------|
| Actions subsystem | enabled | `actions.enabled` |
| Max snippets | 200 | `actions.max-snippets` |
| Max scheduled actions | 50 | `actions.max-scheduled-actions` |
| Scheduling feature | enabled | `actions.scheduling-enabled` |

Exceeding limits returns `400 Bad Request` or `403 Forbidden`. If `actions.enabled: false`, every `/api/actions/*` route returns `403` regardless of the other keys. If `actions.scheduling-enabled: false`, creating or resuming a schedule returns `403`, and any already-scheduled action stops firing (its stored entry is untouched — it just doesn't get armed again until the flag is re-enabled and the plugin reloads or the action is resumed).
