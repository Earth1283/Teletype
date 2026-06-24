import { useRef } from 'react'
import { useSettings } from '../SettingsContext'
import { IconEyeOff, IconSliders, IconTerminal, IconCommand, IconCode, IconPalette } from '../Icons'
import { THEMES, getTheme } from '../themes'

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

function Row({ label, sub, children }: {
  label: string; sub?: string; children: React.ReactNode
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

function NavItem({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
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

  const refFunMode    = useRef<HTMLDivElement>(null)
  const refTheme      = useRef<HTMLDivElement>(null)
  const refGreyBeard  = useRef<HTMLDivElement>(null)
  const refGlance     = useRef<HTMLDivElement>(null)
  const refConsole    = useRef<HTMLDivElement>(null)
  const refStats      = useRef<HTMLDivElement>(null)
  const refPalette    = useRef<HTMLDivElement>(null)
  const refEditor     = useRef<HTMLDivElement>(null)
  const refReset      = useRef<HTMLDivElement>(null)

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="s-root s-root-with-sidebar">
      {/* Sidebar */}
      <div className="s-sidebar">
        <div className="s-sidebar-header">Preferences</div>
        <NavItem label="Fun Mode"      icon="🖥️" onClick={() => scrollTo(refFunMode)} />
        <NavItem label="Appearance"    icon="🎨" onClick={() => scrollTo(refTheme)} />
        <NavItem label="Grey Beard"    icon="👤" onClick={() => scrollTo(refGreyBeard)} />
        <div className="s-sidebar-sep" />
        <NavItem label="Glance"        icon="📊" onClick={() => scrollTo(refGlance)} />
        <NavItem label="Console"       icon="⌨️" onClick={() => scrollTo(refConsole)} />
        <NavItem label="Stats"         icon="📈" onClick={() => scrollTo(refStats)} />
        <div className="s-sidebar-sep" />
        <NavItem label="Palette"       icon="⌘" onClick={() => scrollTo(refPalette)} />
        <NavItem label="Editor"        icon="📝" onClick={() => scrollTo(refEditor)} />
        <div className="s-sidebar-sep" />
        <NavItem label="Reset"         icon="↺" onClick={() => scrollTo(refReset)} />
      </div>

      {/* Content */}
      <div className="s-content">
        {/* ── Fun Mode ─────────────────────────────────────────────── */}
        <div ref={refFunMode} className={`fun-card${settings.fun ? ' fun-active' : ''}`}>
          <span className="fun-card-emoji">🖥️</span>
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
