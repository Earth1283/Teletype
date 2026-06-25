/**
 * Teletype synthetic-data mock server.
 * Runs on :8080 (same port Vite proxies to), serves all API endpoints
 * with live-changing fake data and a WebSocket console stream.
 *
 * Usage: node scripts/mock-server.mjs  (via npm run testFrontend)
 */

import http from 'node:http'
import { WebSocketServer } from 'ws'

const PORT = 8080

// ── Metric state (drifts every second) ───────────────────────────────────────

let tps      = 19.8
let memUsed  = 3200   // MB  (JVM heap)
let cpuPct   = 35     // host CPU %
let sysMemUsed = 12_000  // MB
const MEM_MAX      = 8192
const SYS_MEM_TOTAL = 32_768
const DISK_USED    = 120  // GB
const DISK_TOTAL   = 500
const START_MS     = Date.now()

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
function rnd(lo, hi)      { return lo + Math.random() * (hi - lo) }

function tick() {
  // TPS: brownian, 2% chance of lag event
  if (Math.random() < 0.02) tps -= rnd(3, 9)
  else                       tps += rnd(-0.25, 0.30)
  tps += (19.8 - tps) * 0.08   // drift back toward nominal
  tps  = clamp(tps, 0, 20)

  // JVM heap: sawtooth — grows until ~85%, then GC spike drops it
  memUsed += rnd(8, 25)
  if (memUsed > MEM_MAX * 0.85 || Math.random() < 0.004) {
    memUsed = MEM_MAX * rnd(0.35, 0.55)
  }
  memUsed = clamp(memUsed, 0, MEM_MAX)

  // CPU: random walk [5, 95]
  cpuPct += rnd(-4, 4)
  cpuPct  = clamp(cpuPct, 5, 95)

  // System RAM: slow drift
  sysMemUsed += rnd(-80, 80)
  sysMemUsed  = clamp(sysMemUsed, 8_000, 28_000)
}

function snap() {
  const t5  = clamp(tps + rnd(-0.5, 0.5), 0, 20)
  const t15 = clamp(tps + rnd(-1,   1),   0, 20)
  return {
    timestamp:    Date.now(),
    tps1:         +tps.toFixed(2),
    tps5:         +t5.toFixed(2),
    tps15:        +t15.toFixed(2),
    tickTimeMs:   tps > 0 ? +(1000 / Math.min(tps, 20)).toFixed(1) : 200,
    memUsedMb:    Math.round(memUsed),
    memTotalMb:   Math.round(memUsed * 1.15),
    memMaxMb:     MEM_MAX,
    uptimeMs:     Date.now() - START_MS,
    cpuPercent:   +cpuPct.toFixed(1),
    sysMemUsedMb: Math.round(sysMemUsed),
    sysMemTotalMb: SYS_MEM_TOTAL,
    diskUsedGb:   DISK_USED,
    diskTotalGb:  DISK_TOTAL,
  }
}

// Pre-fill with 5 min of history, then keep rolling
const history = []
for (let ago = 300; ago >= 0; ago--) {
  tick()
  const s = snap()
  s.timestamp = Date.now() - ago * 1000
  history.push(s)
}

setInterval(() => {
  tick()
  history.push(snap())
  if (history.length > 900) history.shift()
}, 1000)

// ── Static datasets ───────────────────────────────────────────────────────────

const PLAYERS = [
  { name: 'Notch',     uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', world: 'world',        health: 20,   foodLevel: 20, level: 35, gameMode: 'survival', ping: 42, isOp: true  },
  { name: 'Herobrine', uuid: 'f84c6a79-0a4e-45e0-879d-cb2bc8fa39e2', world: 'world_nether',  health: 14.5, foodLevel: 17, level: 12, gameMode: 'survival', ping: 88, isOp: false },
  { name: 'jeb_',      uuid: '853c80ef-3c37-49fd-aa49-938b674adae6', world: 'world',        health: 20,   foodLevel: 20, level: 24, gameMode: 'creative', ping: 31, isOp: true  },
]

const CATEGORIES = [
  { id: 'quick-actions', name: 'Quick Actions', color: '#f59e0b', special: true  },
  { id: 'maintenance',   name: 'Maintenance',   color: '#6366f1', special: false },
  { id: 'debug',         name: 'Debug',          color: '#10b981', special: false },
]

const SNIPPETS = [
  {
    id: 's1', name: 'Restart Warning', categoryId: 'quick-actions',
    cmds: ['broadcast §cServer restarting in {minutes} minutes!'], vars: ['minutes'],
  },
  {
    id: 's2', name: 'Save World', categoryId: 'maintenance',
    cmds: ['save-all flush', 'broadcast §aWorld saved.'], vars: [],
  },
  {
    id: 's3', name: 'Debug Memory', categoryId: 'debug',
    cmds: ['gc', 'say GC triggered manually'], vars: [],
  },
  {
    id: 's4', name: 'Kick Player', categoryId: 'quick-actions',
    cmds: ['kick {player} {reason}'], vars: ['player', 'reason'],
  },
]

const AUDIT = [
  { id: 1, ts: Date.now() - 3_600_000, actor: 'Notch',     ip: '127.0.0.1', action: 'execute_command', detail: 'op Herobrine'          },
  { id: 2, ts: Date.now() - 1_800_000, actor: 'Notch',     ip: '127.0.0.1', action: 'file_write',      detail: 'server.properties'     },
  { id: 3, ts: Date.now() -   900_000, actor: 'Herobrine', ip: '10.0.0.2',  action: 'run_snippet',     detail: 'Save World vars={}'    },
  { id: 4, ts: Date.now() -    60_000, actor: 'Notch',     ip: '127.0.0.1', action: 'schedule_create', detail: 'Restart Warning (s1)'  },
  { id: 5, ts: Date.now() -    10_000, actor: 'jeb_',      ip: '10.0.0.3',  action: 'execute_command', detail: 'whitelist add Dinnerbone' },
]

const FILES = [
  { name: 'server.properties', path: 'server.properties',  isDirectory: false, size: 1842,      lastModified: Date.now() - 86_400_000 },
  { name: 'eula.txt',          path: 'eula.txt',           isDirectory: false, size: 128,        lastModified: Date.now() - 172_800_000 },
  { name: 'plugins',           path: 'plugins',            isDirectory: true,  size: 0,          lastModified: Date.now() - 3_600_000   },
  { name: 'world',             path: 'world',              isDirectory: true,  size: 0,          lastModified: Date.now() - 1_800_000   },
  { name: 'logs',              path: 'logs',               isDirectory: true,  size: 0,          lastModified: Date.now() -   600_000   },
  { name: 'paper.jar',         path: 'paper.jar',          isDirectory: false, size: 42_381_204, lastModified: Date.now() - 604_800_000 },
]

const SERVER_PROPERTIES = `#Minecraft server properties
#Generated by Teletype mock server
enable-command-block=false
level-name=world
max-players=20
motd=A Minecraft Server (mock)
online-mode=true
server-port=25565
view-distance=10
`

// ── Log line generation ───────────────────────────────────────────────────────

const LOG_TEMPLATES = [
  '[Server thread/INFO]: Keeping entity §eZombie§r that already exists with UUID',
  '[Server thread/INFO]: §aNotch§f: hello world!',
  '[Server thread/INFO]: Saved the game',
  '[Server thread/WARN]: Can\'t keep up! Is the server overloaded? Running 41ms or 0 ticks behind',
  '[Server thread/INFO]: Preparing spawn area: 97%',
  '[Server thread/INFO]: jeb_ lost connection: Timed out',
  '[Teletype/INFO]: Metrics flushed (15 rows) to SQLite',
  '[Server thread/INFO]: [LuckPerms] Group data refreshed.',
  '[Server thread/WARN]: Skipping BlockEntity with id minecraft:chest',
  '[Server thread/INFO]: Herobrine joined the game',
  '[Server thread/INFO]: Herobrine left the game',
  '[Server thread/INFO]: §9[Teletype]§r WebSocket client connected',
  '[Server thread/INFO]: Loaded 325 advancements',
  '[Server thread/INFO]: §cHerobrine§f whispers: I am watching',
  '[Server thread/INFO]: Notch was slain by Zombie',
  '[Server thread/INFO]: Saving chunks for level \'ServerLevel[world]\'',
  '[Server thread/WARN]: Thread \'Async Chat Thread\' is not in the expected state',
  '[Server thread/INFO]: There are 3 of a max of 20 players online',
  '[Paper/INFO]: Paper config loaded.',
]

function ts() {
  const d = new Date()
  const p = n => n.toString().padStart(2, '0')
  return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`
}

function randomLog() {
  return `${ts()} ${LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)]}`
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function text(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
  res.end(body)
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = ''
    req.on('data', c => raw += c)
    req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
  })
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    })
    res.end()
    return
  }

  const url  = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  const m    = req.method

  // ── Auth (bypass — always verify immediately) ──────────────────────────────
  if (m === 'POST' && path === '/api/auth/challenge') {
    await readBody(req)
    return json(res, { uuid: 'dev', message: 'Development mode — auto-verifying. No action needed.' })
  }
  if (m === 'POST' && path.startsWith('/api/auth/poll/')) {
    return json(res, { status: 'verified', token: 'dev-token' })
  }

  // ── Status ─────────────────────────────────────────────────────────────────
  if (m === 'GET' && path === '/api/status') {
    const s = history.at(-1)
    return json(res, {
      name: 'Mock Paper Server',
      version: 'git-Paper-453 (MC: 1.21.1)',
      onlinePlayers: PLAYERS.length,
      maxPlayers: 20,
      tps: [s?.tps1 ?? 20, s?.tps5 ?? 20, s?.tps15 ?? 20],
    })
  }

  // ── Players ────────────────────────────────────────────────────────────────
  if (m === 'GET'    && path === '/api/players')           return json(res, PLAYERS)
  if (m === 'DELETE' && path.startsWith('/api/players/'))  return json(res, { status: 'kicked' })

  // ── Execute ────────────────────────────────────────────────────────────────
  if (m === 'POST' && path === '/api/execute') {
    await readBody(req)
    return json(res, { status: 'dispatched' })
  }

  // ── Glance ─────────────────────────────────────────────────────────────────
  if (m === 'GET' && path === '/api/glance/current') {
    return json(res, history.at(-1))
  }
  if (m === 'GET' && path === '/api/glance/history') {
    const win  = parseInt(url.searchParams.get('window') ?? '5')
    const since = Date.now() - win * 60_000
    return json(res, history.filter(s => s.timestamp >= since))
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  if (m === 'GET'    && path === '/api/actions/categories')          return json(res, CATEGORIES)
  if (m === 'POST'   && path === '/api/actions/categories')          return json(res, { id: 'new-cat', name: 'New Category', color: '#888', special: false }, 201)
  if (m === 'DELETE' && path.startsWith('/api/actions/categories/')) return json(res, { status: 'deleted' })
  if (m === 'GET'    && path === '/api/actions/snippets')            return json(res, SNIPPETS)
  if (m === 'POST'   && path === '/api/actions/snippets')            return json(res, { id: 'new-s', name: 'New', categoryId: 'maintenance', cmds: [], vars: [] }, 201)
  if (m === 'PUT'    && path.startsWith('/api/actions/snippets/'))   return json(res, { status: 'updated' })
  if (m === 'DELETE' && path.startsWith('/api/actions/snippets/'))   return json(res, { status: 'deleted' })
  if (m === 'POST'   && path.startsWith('/api/actions/execute/'))    return json(res, { status: 'dispatched' })
  if (m === 'GET'    && path === '/api/actions/schedule')            return json(res, [])
  if (m === 'POST'   && path === '/api/actions/schedule')            return json(res, { id: 'sch1', status: 'active' }, 201)
  if (m === 'DELETE' && path.startsWith('/api/actions/schedule/'))   return json(res, { status: 'deleted' })
  if (m === 'PATCH'  && path.endsWith('/pause'))                     return json(res, { status: 'paused' })
  if (m === 'PATCH'  && path.endsWith('/resume'))                    return json(res, { status: 'resumed' })

  // ── Files ──────────────────────────────────────────────────────────────────
  if (m === 'GET'    && path === '/api/files/list')     return json(res, FILES)
  if (m === 'GET'    && path === '/api/files/read')     return text(res, SERVER_PROPERTIES)
  if (m === 'PUT'    && path === '/api/files/write')    return json(res, { status: 'saved' })
  if (m === 'POST'   && path === '/api/files/mkdir')    return json(res, { status: 'created' })
  if (m === 'PATCH'  && path === '/api/files/rename')   return json(res, { status: 'moved' })
  if (m === 'POST'   && path === '/api/files/upload')   return json(res, { status: 'uploaded 1 file(s)' })
  if (m === 'DELETE' && path === '/api/files')          return json(res, { status: 'deleted' })
  if (m === 'GET'    && path === '/api/files/download') {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
    res.end(SERVER_PROPERTIES)
    return
  }
  if (m === 'POST' && path === '/api/files/fetch') return json(res, { status: 'fetched mock.txt (42 bytes)' })

  // ── Audit ──────────────────────────────────────────────────────────────────
  if (m === 'GET' && path === '/api/audit') return json(res, AUDIT)

  // 404
  console.warn(`[mock] unhandled ${m} ${path}`)
  json(res, { error: `mock: no handler for ${m} ${path}` }, 404)
})

// ── WebSocket console ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws/console')) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

wss.on('connection', ws => {
  const send = line => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'log', payload: line }))
  }

  // Replay burst on connect
  for (let i = 0; i < 40; i++) send(randomLog())

  // Trickle with variable cadence
  let timer
  const schedule = () => {
    timer = setTimeout(() => {
      send(randomLog())
      schedule()
    }, 400 + Math.random() * 2200)
  }
  schedule()

  // Echo commands back as console output
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'command') {
        send(`${ts()} [Server thread/INFO]: [CONSOLE]: ${msg.payload}`)
        // fake output lines for common commands
        if (msg.payload === 'list') {
          send(`${ts()} [Server thread/INFO]: There are ${PLAYERS.length} of a max of 20 players online: ${PLAYERS.map(p => p.name).join(', ')}`)
        }
        if (msg.payload === 'gc') {
          send(`${ts()} [Server thread/INFO]: GC forced.`)
        }
      }
    } catch {}
  })

  ws.on('close', () => clearTimeout(timer))
})

// ── Start ──────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\x1b[36m[mock]\x1b[0m Teletype mock server listening on \x1b[1mhttp://localhost:${PORT}\x1b[0m`)
  console.log(`\x1b[36m[mock]\x1b[0m Auth: auto-bypass enabled (token: dev-token)`)
  console.log(`\x1b[36m[mock]\x1b[0m Open: \x1b[1mhttp://localhost:5173\x1b[0m`)
})
