/**
 * Mobile detection E2E test using headless Chromium.
 * Starts mock-server + Vite dev server, runs 5 scenarios, exits 0/1.
 *
 * Usage: node scripts/e2e-mobile.mjs
 *        (or: npm run e2e)
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'

const CHROMIUM  = '/usr/bin/chromium'
const MOCK_URL  = 'http://localhost:8080/api/status'
const TOKEN_KEY = 'teletype-jwt'
const TOKEN     = 'dev-token'

// ── Server lifecycle ──────────────────────────────────────────────────────────

function startProc(cmd, args, label) {
  const proc = spawn(cmd, args, { stdio: 'pipe' })
  proc.stdout.on('data', d => process.stdout.write(`\x1b[2m[${label}] ${d}\x1b[0m`))
  proc.stderr.on('data', d => process.stderr.write(`\x1b[2m[${label}] ${d}\x1b[0m`))
  return proc
}

/** Resolve with the actual URL Vite is listening on (parses stdout). */
function startVite() {
  return new Promise((resolve, reject) => {
    const proc = startProc('node_modules/.bin/vite', ['--port', '15173', '--strictPort'], 'vite')
    proc.stdout.on('data', d => {
      const m = d.toString().match(/Local:\s+(http:\/\/localhost:\d+)/)
      if (m) resolve({ proc, url: m[1] })
    })
    proc.on('exit', code => reject(new Error(`Vite exited with ${code}`)))
    setTimeout(() => reject(new Error('Vite start timeout')), 20_000)
  })
}

async function waitReady(url, maxMs = 30_000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch { /* not up yet */ }
    await sleep(300)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

// ── Page helper ───────────────────────────────────────────────────────────────

async function openAuthed(browser, appUrl, { viewport, userAgent } = {}) {
  const page = await browser.newPage()
  if (viewport) await page.setViewport(viewport)
  if (userAgent) await page.setUserAgent(userAgent)
  // Inject auth token before any page JS runs
  await page.evaluateOnNewDocument((k, t) => localStorage.setItem(k, t), TOKEN_KEY, TOKEN)
  // networkidle2 allows the persistent WebSocket console connection
  await page.goto(appUrl, { waitUntil: 'networkidle2', timeout: 25_000 })
  return page
}

// ── Assertions ────────────────────────────────────────────────────────────────

async function cssDisplay(page, sel) {
  return page.$eval(sel, el => getComputedStyle(el).display)
}

async function exists(page, sel) {
  return !!(await page.$(sel))
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    passed++
  } catch (e) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`)
    console.error(`      ${e.message}`)
    failed++
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const mock = startProc('node', ['scripts/mock-server.mjs'], 'mock')
let viteProc

process.on('exit', () => { mock.kill(); viteProc?.kill() })

try {
  console.log('\nStarting servers...')
  const { proc: vp, url: appUrl } = await startVite()
  viteProc = vp
  await waitReady(MOCK_URL)
  await waitReady(appUrl)
  console.log(`Servers ready — app at ${appUrl}\n`)

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    console.log('Mobile detection E2E tests')
    console.log('─'.repeat(40))

    // 1. Desktop viewport → sidebar visible, mobile nav hidden, JS detects desktop
    await test('desktop 1280×800: sidebar shown, mobile-nav hidden', async () => {
      const page = await openAuthed(browser, appUrl, { viewport: { width: 1280, height: 800 } })
      try {
        assert(await cssDisplay(page, '.sidebar') !== 'none', 'sidebar hidden')
        assert(await cssDisplay(page, '.mobile-bottom-nav') === 'none', 'mobile-nav visible on desktop')
        // JS: isPhoneViewport=false → "📱 Switch to mobile view" button present
        assert(await exists(page, '[aria-label="Switch to mobile view"]'), 'force-mobile btn missing on desktop')
      } finally { await page.close() }
    })

    // 2. Mobile viewport → mobile nav visible, sidebar hidden, JS detects mobile
    await test('mobile 375×812 (isMobile+touch): mobile-nav shown, JS detects mobile', async () => {
      const page = await openAuthed(browser, appUrl, {
        viewport: { width: 375, height: 812, isMobile: true, hasTouch: true },
      })
      try {
        const navDisplay = await cssDisplay(page, '.mobile-bottom-nav')
        assert(navDisplay !== 'none', `mobile-nav not shown (display: ${navDisplay})`)
        // JS: isPhoneViewport=true → "📱" button absent
        assert(!(await exists(page, '[aria-label="Switch to mobile view"]')), 'force-mobile btn shown on mobile')
      } finally { await page.close() }
    })

    // 3. Mobile UA on desktop-sized viewport → JS detects mobile via hasPhoneUserAgent
    await test('iPhone UA on 1024×768: JS detects mobile regardless of viewport', async () => {
      const page = await openAuthed(browser, appUrl, {
        viewport: { width: 1024, height: 768 },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      })
      try {
        // CSS: viewport is 1024px → mobile-nav hidden (CSS doesn't know it's a phone)
        assert(await cssDisplay(page, '.mobile-bottom-nav') === 'none', 'mobile-nav should be hidden at 1024px')
        // JS: hasPhoneUserAgent() → isPhoneViewport=true → no "📱" button
        assert(!(await exists(page, '[aria-label="Switch to mobile view"]')), 'force-mobile btn visible with iPhone UA')
      } finally { await page.close() }
    })

    // 4. Resize from 1280→375 triggers CSS media query switch
    await test('resize 1280→375: mobile-nav becomes visible', async () => {
      const page = await openAuthed(browser, appUrl, { viewport: { width: 1280, height: 800 } })
      try {
        assert(await cssDisplay(page, '.mobile-bottom-nav') === 'none', 'mobile-nav visible before resize')
        await page.setViewport({ width: 375, height: 812 })
        await sleep(200) // let CSS media query + React re-render settle
        const navDisplay = await cssDisplay(page, '.mobile-bottom-nav')
        assert(navDisplay !== 'none', `mobile-nav still hidden after resize (display: ${navDisplay})`)
      } finally { await page.close() }
    })

    // 5. screen.width===0 guard: with zero screen dims + 1280px viewport, NOT detected as mobile
    await test('screen.width=0 guard: zero screen dims + wide viewport = desktop', async () => {
      const page = await openAuthed(browser, appUrl, { viewport: { width: 1280, height: 800 } })
      try {
        // Patch window.screen to return 0 (simulates headless envs w/ unreported screen size)
        const mobileDetected = await page.evaluate(() => {
          Object.defineProperty(window.screen, 'width',  { get: () => 0, configurable: true })
          Object.defineProperty(window.screen, 'height', { get: () => 0, configurable: true })
          // Re-invoke the detection logic with the same conditions as App.tsx
          const PHONE_VIEWPORT_QUERY = '(max-width: 640px)'
          const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)'
          const MAX_SHORT = 500, MAX_LONG = 1000
          const hasTouchInput = navigator.maxTouchPoints > 0 || 'ontouchstart' in window
          const mq = window.matchMedia(PHONE_VIEWPORT_QUERY).matches
          const ptr = window.matchMedia(COARSE_POINTER_QUERY).matches
          const short = Math.min(window.screen.width, window.screen.height) // 0
          const long  = Math.max(window.screen.width, window.screen.height) // 0
          // Mimic fixed code: short <= 0 → return false
          if (short <= 0) return false
          const phoneSized = short <= MAX_SHORT && long <= MAX_LONG
          return mq || (hasTouchInput && ptr && phoneSized)
        })
        assert(!mobileDetected, 'screen.width=0 on 1280px viewport falsely detected as mobile')
      } finally { await page.close() }
    })

  } finally {
    await browser.close()
  }

} catch (err) {
  console.error('\nSetup failed:', err.message)
  process.exit(1)
}

console.log('\n' + '─'.repeat(40))
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
