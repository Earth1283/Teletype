import { useRef } from 'react'
import { useSettings } from '../SettingsContext'
import {
  IconEyeOff, IconSliders, IconTerminal, IconCommand, IconCode, IconPalette,
  IconActivity, IconSettings, IconRefresh, IconMonitor, IconApple,
} from '../Icons'
import { THEMES, getTheme } from '../themes'
import { CONTEXT_WHEEL_ACTIONS } from '../contextWheelActions'

// ── Primitive controls ────────────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }: {
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={value}
      disabled={disabled}
      className={`s-toggle${value ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => !disabled && onChange(!value)}
    >
      <span className="s-toggle-thumb" />
    </button>
  )
}

function Slider({ value, min, max, step, onChange, fmt, disabled }: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string; disabled?: boolean
}) {
  return (
    <div className={`s-slider-wrap${disabled ? ' disabled' : ''}`}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        className="s-slider"
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="s-slider-val">{fmt ? fmt(value) : value}</span>
    </div>
  )
}

function ZoneDot({ color }: { color: string }) {
  return (
    <svg width="7" height="7" viewBox="0 0 7 7" style={{ display: 'inline-block', marginRight: 5, verticalAlign: 'middle', flexShrink: 0 }}>
      <circle cx="3.5" cy="3.5" r="3.5" fill={color} />
    </svg>
  )
}

function Row({ label, sub, children }: {
  label: React.ReactNode; sub?: string; children: React.ReactNode
}) {
  return (
    <div className="s-row">
      <div className="s-row-labels">
        <span className="s-row-label">{label}</span>
        {sub && <span className="s-row-sub">{sub}</span>}
      </div>
      <div className="s-row-ctrl">{children}</div>
    </div>
  )
}

function Section({ title, icon, dimmed, children, sectionRef }: {
  title: string; icon: React.ReactNode; dimmed?: boolean; children: React.ReactNode
  sectionRef?: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div ref={sectionRef} className={`s-section${dimmed ? ' dimmed' : ''}`}>
      <div className="s-section-head">
        <span className="s-section-icon">{icon}</span>
        <span className="s-section-title">{title}</span>
      </div>
      <div className="s-section-body">{children}</div>
    </div>
  )
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────

function NavItem({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button className="s-nav-item" onClick={onClick}>
      <span className="s-nav-icon">{icon}</span>
      <span className="s-nav-label">{label}</span>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, update, reset } = useSettings()
  const { greyBeardMode: gbm } = settings

  const setGlance = (patch: Partial<typeof settings.glance>) => update({ glance: patch })
  const setConsole = (patch: Partial<typeof settings.console>) => update({ console: patch })
  const setEditor  = (patch: Partial<typeof settings.editor>) => update({ editor: patch })
  const setStats   = (patch: Partial<typeof settings.stats>)  => update({ stats: patch })
  const setContextWheel = (patch: Partial<typeof settings.contextWheel>) => update({ contextWheel: patch })

  const refFunMode    = useRef<HTMLDivElement>(null)
  const refTheme      = useRef<HTMLDivElement>(null)
  const refGreyBeard  = useRef<HTMLDivElement>(null)
  const refGlance     = useRef<HTMLDivElement>(null)
  const refConsole    = useRef<HTMLDivElement>(null)
  const refStats      = useRef<HTMLDivElement>(null)
  const refPalette    = useRef<HTMLDivElement>(null)
  const refWheel      = useRef<HTMLDivElement>(null)
  const refEditor     = useRef<HTMLDivElement>(null)
  const refReset      = useRef<HTMLDivElement>(null)

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <div className="s-root s-root-with-sidebar">
      {/* Sidebar */}
      <div className="s-sidebar">
        <div className="s-sidebar-header">Preferences</div>
        <NavItem label="Fun Mode"      icon={<IconMonitor size={13} />}  onClick={() => scrollTo(refFunMode)} />
        <NavItem label="Appearance"    icon={<IconPalette size={13} />}  onClick={() => scrollTo(refTheme)} />
        <NavItem label="Grey Beard"    icon={<IconEyeOff size={13} />}   onClick={() => scrollTo(refGreyBeard)} />
        <div className="s-sidebar-sep" />
        <NavItem label="Glance"        icon={<IconActivity size={13} />} onClick={() => scrollTo(refGlance)} />
        <NavItem label="Console"       icon={<IconTerminal size={13} />} onClick={() => scrollTo(refConsole)} />
        <NavItem label="Stats"         icon={<IconSliders size={13} />}  onClick={() => scrollTo(refStats)} />
        <div className="s-sidebar-sep" />
        <NavItem label="Palette"       icon={<IconCommand size={13} />}  onClick={() => scrollTo(refPalette)} />
        <NavItem label="Context Wheel" icon={<IconSettings size={13} />} onClick={() => scrollTo(refWheel)} />
        <NavItem label="Editor"        icon={<IconCode size={13} />}     onClick={() => scrollTo(refEditor)} />
        <div className="s-sidebar-sep" />
        <NavItem label="Reset"         icon={<IconRefresh size={13} />}  onClick={() => scrollTo(refReset)} />
      </div>

      {/* Content */}
      <div className="s-content">
        {/* ── Appleify (mobile-only easter egg) ────────────────────── */}
        <div className={`appleify-card${settings.appleify ? ' fun-active' : ''}`}>
          <span className="appleify-card-icon"><IconApple size={22} /></span>
          <div className="appleify-card-body">
            <div className="appleify-card-title">Appleify</div>
            <div className="appleify-card-desc">
              Transforms Teletype into an Apple HCI experience — iOS navigation bars,
              Liquid Glass materials, Apple color system, and auto dark / light mode.
              Activate secretly: tap the Teletype logo 5 times.
            </div>
          </div>
          <Toggle value={settings.appleify} onChange={v => update({ appleify: v })} />
        </div>

        {/* ── Fun Mode ─────────────────────────────────────────────── */}
        <div ref={refFunMode} className={`fun-card${settings.fun ? ' fun-active' : ''}`}>
          <span className="fun-card-icon"><IconMonitor size={22} /></span>
          <div className="fun-card-text">
            <div className="fun-card-title">Fun Mode</div>
            <div className="fun-card-desc">
              Transforms Teletype into a simulated macOS desktop. Drag windows, resize them,
              use Spotlight (⌘K) to navigate. Finder opens the server filesystem.
            </div>
          </div>
          <Toggle value={settings.fun} onChange={v => update({ fun: v })} />
        </div>

        {/* ── Theme ────────────────────────────────────────────────── */}
        <div ref={refTheme}>
          <Section title="Theme" icon={<IconPalette size={13} />}>
            <div className="s-theme-grid">
              {THEMES.map(t => {
                const active = (settings.theme ?? 'void-amber') === t.id
                return (
                  <button
                    key={t.id}
                    className={`s-theme-swatch${active ? ' active' : ''}`}
                    onClick={() => update({ theme: t.id })}
                    title={t.name}
                  >
                    <span className="s-theme-preview" style={{ background: t.bg }}>
                      <span className="s-theme-accent" style={{ background: t.accent }} />
                      {t.base === 'light' && (
                        <span className="s-theme-line" style={{ background: '#d4d4d8' }} />
                      )}
                    </span>
                    <span className="s-theme-name">{t.name}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ padding: '4px 14px 8px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ghost)' }}>
              Current: {getTheme(settings.theme ?? 'void-amber').name}
            </div>
          </Section>
        </div>

        {/* ── Grey Beard Mode ──────────────────────────────────────── */}
        <div ref={refGreyBeard} className={`gbm-card${gbm ? ' gbm-active' : ''}`}>
          <div className="gbm-icon-wrap">
            <IconEyeOff size={22} />
          </div>
          <div className="gbm-text">
            <div className="gbm-title">Grey Beard Mode</div>
            <div className="gbm-desc">
              Kills anomaly detection, incident tooltips, log correlation, bifurcation gradients,
              and badge pulsing. Raw signal, no interpretation. For operators who trust their eyes.
            </div>
          </div>
          <Toggle value={gbm} onChange={v => update({ greyBeardMode: v })} />
        </div>

        {/* ── Glance ───────────────────────────────────────────────── */}
        <Section title="Glance" icon={<IconSliders size={13} />} dimmed={gbm} sectionRef={refGlance}>
          <div className="s-subsection-label">Anomaly thresholds (σ from mean)</div>
          <Row label="TPS sigma" sub="Flag TPS dips farther than N standard deviations">
            <Slider value={settings.glance.anomalyThresholdTps} min={1} max={5} step={0.1}
              fmt={v => `${v.toFixed(1)}σ`} disabled={gbm}
              onChange={v => setGlance({ anomalyThresholdTps: v })} />
          </Row>
          <Row label="Tick time sigma">
            <Slider value={settings.glance.anomalyThresholdTick} min={1} max={5} step={0.1}
              fmt={v => `${v.toFixed(1)}σ`} disabled={gbm}
              onChange={v => setGlance({ anomalyThresholdTick: v })} />
          </Row>
          <Row label="Memory sigma">
            <Slider value={settings.glance.anomalyThresholdMem} min={1} max={5} step={0.1}
              fmt={v => `${v.toFixed(1)}σ`} disabled={gbm}
              onChange={v => setGlance({ anomalyThresholdMem: v })} />
          </Row>
          <Row label="CPU sigma">
            <Slider value={settings.glance.anomalyThresholdCpu} min={1} max={5} step={0.1}
              fmt={v => `${v.toFixed(1)}σ`} disabled={gbm}
              onChange={v => setGlance({ anomalyThresholdCpu: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">Log correlation</div>
          <Row label="Enable log correlation" sub="Match chart anomalies to console log lines">
            <Toggle value={settings.glance.logCorrelation} disabled={gbm}
              onChange={v => setGlance({ logCorrelation: v })} />
          </Row>
          <Row label="Correlation window" sub="How far from chart point to search for logs">
            <Slider value={settings.glance.logCorrelationWindowMs} min={500} max={30_000} step={500}
              fmt={v => `±${(v / 1000).toFixed(1)}s`}
              disabled={gbm || !settings.glance.logCorrelation}
              onChange={v => setGlance({ logCorrelationWindowMs: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">Display</div>
          <Row label="Bifurcation marker" sub="Dim/bright gradient split between historical and focus zones">
            <Toggle value={settings.glance.showBifurcation} disabled={gbm}
              onChange={v => setGlance({ showBifurcation: v })} />
          </Row>
          <Row label="Log panel" sub="Side panel showing live logs; click chart to jump">
            <Toggle value={settings.glance.showLogPanel} disabled={gbm}
              onChange={v => setGlance({ showLogPanel: v })} />
          </Row>
          <Row label="Status badge pulse" sub="Animated glow on DEGRADED / INCIDENT badge">
            <Toggle value={settings.glance.statusBadgePulse} disabled={gbm}
              onChange={v => setGlance({ statusBadgePulse: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">Visible charts</div>
          <Row label="TPS"><Toggle value={settings.glance.showChartTps} onChange={v => setGlance({ showChartTps: v })} /></Row>
          <Row label="Tick time"><Toggle value={settings.glance.showChartTick} onChange={v => setGlance({ showChartTick: v })} /></Row>
          <Row label="Memory"><Toggle value={settings.glance.showChartMem} onChange={v => setGlance({ showChartMem: v })} /></Row>
          <Row label="Host CPU"><Toggle value={settings.glance.showChartCpu} onChange={v => setGlance({ showChartCpu: v })} /></Row>

          <div className="s-divider" />
          <Row label="Live refresh interval" sub="How often /glance/current is polled">
            <Slider value={settings.glance.refreshIntervalMs} min={500} max={10_000} step={500}
              fmt={v => `${(v / 1000).toFixed(1)}s`}
              onChange={v => setGlance({ refreshIntervalMs: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">Gauge zone thresholds</div>
          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 0 }}>TPS — green above, yellow/orange/red below</div>
          <Row label={<><ZoneDot color="#eab308" />TPS yellow below</>} sub="≤ this value triggers yellow">
            <Slider value={settings.glance.tpsYellowBelow} min={10} max={20} step={0.5}
              fmt={v => v.toFixed(1)} onChange={v => setGlance({ tpsYellowBelow: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />TPS orange below</>}>
            <Slider value={settings.glance.tpsOrangeBelow} min={5} max={19} step={0.5}
              fmt={v => v.toFixed(1)} onChange={v => setGlance({ tpsOrangeBelow: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />TPS red below</>}>
            <Slider value={settings.glance.tpsRedBelow} min={1} max={15} step={0.5}
              fmt={v => v.toFixed(1)} onChange={v => setGlance({ tpsRedBelow: v })} />
          </Row>

          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 4 }}>MSPT (tick time) — green below, yellow/orange/red above</div>
          <Row label={<><ZoneDot color="#eab308" />MSPT yellow above</>}>
            <Slider value={settings.glance.msptYellowAbove} min={10} max={100} step={1}
              fmt={v => `${v}ms`} onChange={v => setGlance({ msptYellowAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />MSPT orange above</>}>
            <Slider value={settings.glance.msptOrangeAbove} min={15} max={150} step={1}
              fmt={v => `${v}ms`} onChange={v => setGlance({ msptOrangeAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />MSPT red above</>}>
            <Slider value={settings.glance.msptRedAbove} min={20} max={200} step={1}
              fmt={v => `${v}ms`} onChange={v => setGlance({ msptRedAbove: v })} />
          </Row>

          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 4 }}>Memory & Sys RAM (%)</div>
          <Row label={<><ZoneDot color="#eab308" />Memory yellow above</>}>
            <Slider value={settings.glance.memYellowAbove} min={30} max={90} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ memYellowAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />Memory orange above</>}>
            <Slider value={settings.glance.memOrangeAbove} min={50} max={95} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ memOrangeAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />Memory red above</>}>
            <Slider value={settings.glance.memRedAbove} min={60} max={99} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ memRedAbove: v })} />
          </Row>

          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 4 }}>CPU (%)</div>
          <Row label={<><ZoneDot color="#eab308" />CPU yellow above</>}>
            <Slider value={settings.glance.cpuYellowAbove} min={20} max={85} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ cpuYellowAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />CPU orange above</>}>
            <Slider value={settings.glance.cpuOrangeAbove} min={30} max={90} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ cpuOrangeAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />CPU red above</>}>
            <Slider value={settings.glance.cpuRedAbove} min={50} max={99} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ cpuRedAbove: v })} />
          </Row>

          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 4 }}>Disk (%)</div>
          <Row label={<><ZoneDot color="#eab308" />Disk yellow above</>}>
            <Slider value={settings.glance.diskYellowAbove} min={30} max={90} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ diskYellowAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />Disk orange above</>}>
            <Slider value={settings.glance.diskOrangeAbove} min={50} max={95} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ diskOrangeAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />Disk red above</>}>
            <Slider value={settings.glance.diskRedAbove} min={60} max={99} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ diskRedAbove: v })} />
          </Row>
        </Section>

        {/* ── Console ──────────────────────────────────────────────── */}
        <Section title="Console" icon={<IconTerminal size={13} />} sectionRef={refConsole}>
          <Row label="Font size">
            <Slider value={settings.console.fontSize} min={10} max={18} step={0.5}
              fmt={v => `${v}px`} onChange={v => setConsole({ fontSize: v })} />
          </Row>
          <Row label="Buffer lines" sub="Max log lines kept in memory">
            <Slider value={settings.console.displayLines} min={500} max={10_000} step={500}
              fmt={v => v.toLocaleString()} onChange={v => setConsole({ displayLines: v })} />
          </Row>
          <Row label="Word wrap">
            <Toggle value={settings.console.wordWrap} onChange={v => setConsole({ wordWrap: v })} />
          </Row>
          <Row label="Show timestamps" sub="Display [HH:MM:SS] prefix on each line">
            <Toggle value={settings.console.showTimestamps} onChange={v => setConsole({ showTimestamps: v })} />
          </Row>
        </Section>

        {/* ── Stats ────────────────────────────────────────────────── */}
        <Section title="Stats" icon={<IconSliders size={13} />} sectionRef={refStats}>
          <div className="s-subsection-label">Default time range</div>
          <Row label="Default range" sub="Time window shown when opening the Stats page">
            <div className="s-seg">
              {(['1h', '6h', '24h', '7d'] as const).map(r => (
                <button key={r}
                  className={`s-seg-btn${settings.stats.defaultRange === r ? ' active' : ''}`}
                  onClick={() => setStats({ defaultRange: r })}>{r}</button>
              ))}
            </div>
          </Row>
          <div className="s-divider" />
          <div className="s-subsection-label">Visible charts</div>
          <Row label="TPS" sub="TPS 1m history with 5m average">
            <Toggle value={settings.stats.showChartTps} onChange={v => setStats({ showChartTps: v })} />
          </Row>
          <Row label="MSPT" sub="Mean tick time history">
            <Toggle value={settings.stats.showChartMspt} onChange={v => setStats({ showChartMspt: v })} />
          </Row>
          <Row label="Player count" sub="Online player count over time with join/leave markers">
            <Toggle value={settings.stats.showChartPlayers} onChange={v => setStats({ showChartPlayers: v })} />
          </Row>
          <Row label="Entity count" sub="Total entities across all worlds">
            <Toggle value={settings.stats.showChartEntities} onChange={v => setStats({ showChartEntities: v })} />
          </Row>
          <Row label="Loaded chunks" sub="Total loaded chunks across all worlds">
            <Toggle value={settings.stats.showChartChunks} onChange={v => setStats({ showChartChunks: v })} />
          </Row>
          <Row label="Ping percentiles" sub="P50 / P95 player latency (Paper forks only)">
            <Toggle value={settings.stats.showChartPing} onChange={v => setStats({ showChartPing: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">Z-score overlay</div>
          <Row label="Performance overlay" sub="TPS / MSPT / JVM mem / CPU on unified σ axis">
            <Toggle value={settings.stats.showOverlayPerf} onChange={v => setStats({ showOverlayPerf: v })} />
          </Row>
          <Row label="World overlay" sub="Players / entities / chunks / ping on unified σ axis">
            <Toggle value={settings.stats.showOverlayWorld} onChange={v => setStats({ showOverlayWorld: v })} />
          </Row>
          <Row label="Anomaly markers" sub="Vertical markers where any series exceeds threshold; click for logs">
            <Toggle value={settings.stats.overlayAnomalyMarkers} onChange={v => setStats({ overlayAnomalyMarkers: v })} />
          </Row>
          <Row label="Anomaly threshold" sub="σ beyond which a point is flagged">
            <Slider value={settings.stats.overlayAnomalyThreshold} min={1} max={5} step={0.5}
              fmt={v => `${v.toFixed(1)}σ`} onChange={v => setStats({ overlayAnomalyThreshold: v })} />
          </Row>
          <div className="s-divider" />
          <Row label="Correlation table" sub="Pearson r between all metric pairs">
            <Toggle value={settings.stats.showCorrelation} onChange={v => setStats({ showCorrelation: v })} />
          </Row>
        </Section>

        {/* ── Command palette ───────────────────────────────────────── */}
        <Section title="Command Palette" icon={<IconCommand size={13} />} sectionRef={refPalette}>
          <Row label="Enabled" sub="Open with ⌘K (or Ctrl+K). Type run <cmd> to send console commands.">
            <Toggle value={settings.palette.enabled} onChange={v => update({ palette: { enabled: v } })} />
          </Row>
        </Section>

        {/* ── Context wheel ────────────────────────────────────────── */}
        <Section title="Context Wheel" icon={<IconCommand size={13} />} sectionRef={refWheel}>
          <Row label="Release to select" sub="Hold Alt + right mouse, push into a sector, release to run it">
            <Toggle
              value={settings.contextWheel.releaseToSelect}
              onChange={v => setContextWheel({ releaseToSelect: v })}
            />
          </Row>
          <div className="s-divider" />
          <div className="s-subsection-label">Global panel actions</div>
          {CONTEXT_WHEEL_ACTIONS.map(action => {
            const enabled = settings.contextWheel.actions.includes(action.id)
            return (
              <Row key={action.id} label={action.label}>
                <Toggle
                  value={enabled}
                  onChange={v => {
                    const selected = new Set(settings.contextWheel.actions)
                    if (v) selected.add(action.id)
                    else selected.delete(action.id)
                    setContextWheel({
                      actions: CONTEXT_WHEEL_ACTIONS
                        .filter(a => selected.has(a.id))
                        .map(a => a.id),
                    })
                  }}
                />
              </Row>
            )
          })}
        </Section>

        {/* ── Editor ────────────────────────────────────────────────── */}
        <Section title="Editor" icon={<IconCode size={13} />} sectionRef={refEditor}>
          <Row label="Font size">
            <Slider value={settings.editor.fontSize} min={10} max={20} step={0.5}
              fmt={v => `${v}px`} onChange={v => setEditor({ fontSize: v })} />
          </Row>
          <Row label="Word wrap">
            <Toggle value={settings.editor.wordWrap} onChange={v => setEditor({ wordWrap: v })} />
          </Row>
          <Row label="Line numbers">
            <Toggle value={settings.editor.lineNumbers} onChange={v => setEditor({ lineNumbers: v })} />
          </Row>
          <div className="s-divider" />
          <div className="s-subsection-label">Intelligence</div>
          <Row label="Smooth caret" sub="Animate cursor movement">
            <Toggle value={settings.editor.smoothCaret} onChange={v => setEditor({ smoothCaret: v })} />
          </Row>
          <Row label="Syntax suggestions" sub="IntelliSense autocomplete and parameter hints">
            <Toggle value={settings.editor.suggestions} onChange={v => setEditor({ suggestions: v })} />
          </Row>
          <Row label="Linting / validation" sub="Inline errors for JSON, TypeScript, JavaScript">
            <Toggle value={settings.editor.validate} onChange={v => setEditor({ validate: v })} />
          </Row>
          <Row label="Render whitespace" sub="Show space and tab markers at word boundaries">
            <Toggle value={settings.editor.renderWhitespace} onChange={v => setEditor({ renderWhitespace: v })} />
          </Row>
        </Section>

        {/* ── Reset ─────────────────────────────────────────────────── */}
        <div ref={refReset} className="s-footer">
          <button className="s-reset-btn" onClick={reset}>
            Reset all settings to defaults
          </button>
        </div>
      </div>
    </div>
  )
}
