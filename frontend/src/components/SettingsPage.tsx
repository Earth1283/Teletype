import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings, type ThemePalette, type Language } from '../SettingsContext'
import { SUPPORTED_LANGUAGES } from '../languages'
import {
  IconEyeOff, IconSliders, IconTerminal, IconCommand, IconCode,
  IconActivity, IconSettings, IconRefresh, IconMonitor, IconApple,
} from '../Icons'
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

// ── Theme palettes (preview colors are intentionally literal: a swatch must
//    show its own palette regardless of the active theme) ─────────────────────

const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  zh: '中文',
}

const THEME_SWATCHES: { id: ThemePalette; name: string; accent: string; bg: string; surface: string }[] = [
  { id: 'cobalt',  name: 'Cobalt',  accent: '#4C82F7', bg: '#0D0F13', surface: '#1B1E25' },
  { id: 'signal',  name: 'Signal',  accent: '#F5A524', bg: '#0A0A0C', surface: '#1B1B1F' },
  { id: 'verdant', name: 'Verdant', accent: '#3FB380', bg: '#0D0F13', surface: '#1B1E25' },
  { id: 'iris',    name: 'Iris',    accent: '#9089F5', bg: '#0D0F13', surface: '#1B1E25' },
  { id: 'ocean',   name: 'Ocean',   accent: '#3EB8CE', bg: '#0D0F13', surface: '#1B1E25' },
  { id: 'rose',    name: 'Rose',    accent: '#E5729A', bg: '#0D0F13', surface: '#1B1E25' },
]

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
  const { t } = useTranslation('settings')
  const { settings, update, reset } = useSettings()
  const { greyBeardMode: gbm } = settings

  const setGlance = (patch: Partial<typeof settings.glance>) => update({ glance: patch })
  const setConsole = (patch: Partial<typeof settings.console>) => update({ console: patch })
  const setEditor  = (patch: Partial<typeof settings.editor>) => update({ editor: patch })
  const setStats   = (patch: Partial<typeof settings.stats>)  => update({ stats: patch })
  const setContextWheel = (patch: Partial<typeof settings.contextWheel>) => update({ contextWheel: patch })

  const refAppearance = useRef<HTMLDivElement>(null)
  const refFunMode    = useRef<HTMLDivElement>(null)
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
        <div className="s-sidebar-header">{t('sidebar.header')}</div>
        <NavItem label={t('sidebar.appearance')}    icon={<IconSliders size={13} />}  onClick={() => scrollTo(refAppearance)} />
        <NavItem label={t('sidebar.funMode')}       icon={<IconMonitor size={13} />}  onClick={() => scrollTo(refFunMode)} />
        <NavItem label={t('sidebar.greyBeard')}     icon={<IconEyeOff size={13} />}   onClick={() => scrollTo(refGreyBeard)} />
        <div className="s-sidebar-sep" />
        <NavItem label={t('sidebar.glance')}        icon={<IconActivity size={13} />} onClick={() => scrollTo(refGlance)} />
        <NavItem label={t('sidebar.console')}       icon={<IconTerminal size={13} />} onClick={() => scrollTo(refConsole)} />
        <NavItem label={t('sidebar.stats')}         icon={<IconSliders size={13} />}  onClick={() => scrollTo(refStats)} />
        <div className="s-sidebar-sep" />
        <NavItem label={t('sidebar.palette')}       icon={<IconCommand size={13} />}  onClick={() => scrollTo(refPalette)} />
        <NavItem label={t('sidebar.contextWheel')}  icon={<IconSettings size={13} />} onClick={() => scrollTo(refWheel)} />
        <NavItem label={t('sidebar.editor')}        icon={<IconCode size={13} />}     onClick={() => scrollTo(refEditor)} />
        <div className="s-sidebar-sep" />
        <NavItem label={t('sidebar.reset')}         icon={<IconRefresh size={13} />}  onClick={() => scrollTo(refReset)} />
      </div>

      {/* Content */}
      <div className="s-content">
        {/* ── Appearance ───────────────────────────────────────────── */}
        <Section title={t('section.appearance')} icon={<IconSliders size={13} />} sectionRef={refAppearance}>
          <Row label={t('appearance.modeLabel')} sub={t('appearance.modeSub')}>
            <div className="s-seg">
              {(['system', 'light', 'dark'] as const).map(m => (
                <button key={m}
                  className={`s-seg-btn${settings.appearance.mode === m ? ' active' : ''}`}
                  onClick={() => update({ appearance: { mode: m } })}>
                  {m === 'system' ? t('appearance.modeSystem') : m === 'light' ? t('appearance.modeLight') : t('appearance.modeDark')}
                </button>
              ))}
            </div>
          </Row>
          <div className="s-divider" />
          <div className="s-subsection-label">{t('appearance.themeSubsection')}</div>
          <div className="s-theme-grid">
            {THEME_SWATCHES.map(t => (
              <button
                key={t.id}
                className={`s-theme-swatch${settings.appearance.theme === t.id ? ' active' : ''}`}
                onClick={() => update({ appearance: { theme: t.id } })}
                aria-pressed={settings.appearance.theme === t.id}
              >
                <span className="s-theme-preview" style={{ background: t.bg }}>
                  <span className="s-theme-line" style={{ background: t.surface, opacity: 1 }} />
                  <span className="s-theme-accent" style={{ background: t.accent }} />
                </span>
                <span className="s-theme-name">{t.name}</span>
              </button>
            ))}
          </div>
          <div className="s-divider" />
          <Row label={t('appearance.densityLabel')} sub={t('appearance.densitySub')}>
            <div className="s-seg">
              {(['comfortable', 'compact'] as const).map(d => (
                <button key={d}
                  className={`s-seg-btn${settings.appearance.density === d ? ' active' : ''}`}
                  onClick={() => update({ appearance: { density: d } })}>
                  {d === 'comfortable' ? t('appearance.densityComfortable') : t('appearance.densityCompact')}
                </button>
              ))}
            </div>
          </Row>
          <div className="s-divider" />
          <Row label={t('appearance.languageLabel')} sub={t('appearance.languageSub')}>
            <div className="s-seg">
              {SUPPORTED_LANGUAGES.map(l => (
                <button key={l}
                  className={`s-seg-btn${settings.language === l ? ' active' : ''}`}
                  onClick={() => update({ language: l })}>
                  {LANGUAGE_NAMES[l]}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* ── Appleify (mobile-only easter egg) ────────────────────── */}
        <div className={`appleify-card${settings.appleify ? ' fun-active' : ''}`}>
          <span className="appleify-card-icon"><IconApple size={22} /></span>
          <div className="appleify-card-body">
            <div className="appleify-card-title">{t('appleify.title')}</div>
            <div className="appleify-card-desc">
              {t('appleify.desc')}
            </div>
          </div>
          <Toggle value={settings.appleify} onChange={v => update({ appleify: v })} />
        </div>

        {/* ── Fun Mode ─────────────────────────────────────────────── */}
        <div ref={refFunMode} className={`fun-card${settings.fun ? ' fun-active' : ''}`}>
          <span className="fun-card-icon"><IconMonitor size={22} /></span>
          <div className="fun-card-text">
            <div className="fun-card-title">{t('funMode.title')}</div>
            <div className="fun-card-desc">
              {t('funMode.desc')}
            </div>
          </div>
          <Toggle value={settings.fun} onChange={v => update({ fun: v })} />
        </div>

        {/* ── Grey Beard Mode ──────────────────────────────────────── */}
        <div ref={refGreyBeard} className={`gbm-card${gbm ? ' gbm-active' : ''}`}>
          <div className="gbm-icon-wrap">
            <IconEyeOff size={22} />
          </div>
          <div className="gbm-text">
            <div className="gbm-title">{t('greyBeard.title')}</div>
            <div className="gbm-desc">
              {t('greyBeard.desc')}
            </div>
          </div>
          <Toggle value={gbm} onChange={v => update({ greyBeardMode: v })} />
        </div>

        {/* ── Glance ───────────────────────────────────────────────── */}
        <Section title={t('section.glance')} icon={<IconSliders size={13} />} dimmed={gbm} sectionRef={refGlance}>
          <div className="s-subsection-label">{t('glance.anomalyThresholdsSubsection')}</div>
          <Row label={t('glance.tpsSigmaLabel')} sub={t('glance.tpsSigmaSub')}>
            <Slider value={settings.glance.anomalyThresholdTps} min={1} max={5} step={0.1}
              fmt={v => `${v.toFixed(1)}σ`} disabled={gbm}
              onChange={v => setGlance({ anomalyThresholdTps: v })} />
          </Row>
          <Row label={t('glance.tickSigmaLabel')}>
            <Slider value={settings.glance.anomalyThresholdTick} min={1} max={5} step={0.1}
              fmt={v => `${v.toFixed(1)}σ`} disabled={gbm}
              onChange={v => setGlance({ anomalyThresholdTick: v })} />
          </Row>
          <Row label={t('glance.memSigmaLabel')}>
            <Slider value={settings.glance.anomalyThresholdMem} min={1} max={5} step={0.1}
              fmt={v => `${v.toFixed(1)}σ`} disabled={gbm}
              onChange={v => setGlance({ anomalyThresholdMem: v })} />
          </Row>
          <Row label={t('glance.cpuSigmaLabel')}>
            <Slider value={settings.glance.anomalyThresholdCpu} min={1} max={5} step={0.1}
              fmt={v => `${v.toFixed(1)}σ`} disabled={gbm}
              onChange={v => setGlance({ anomalyThresholdCpu: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">{t('glance.logCorrelationSubsection')}</div>
          <Row label={t('glance.enableLogCorrelationLabel')} sub={t('glance.enableLogCorrelationSub')}>
            <Toggle value={settings.glance.logCorrelation} disabled={gbm}
              onChange={v => setGlance({ logCorrelation: v })} />
          </Row>
          <Row label={t('glance.correlationWindowLabel')} sub={t('glance.correlationWindowSub')}>
            <Slider value={settings.glance.logCorrelationWindowMs} min={500} max={30_000} step={500}
              fmt={v => `±${(v / 1000).toFixed(1)}s`}
              disabled={gbm || !settings.glance.logCorrelation}
              onChange={v => setGlance({ logCorrelationWindowMs: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">{t('glance.displaySubsection')}</div>
          <Row label={t('glance.bifurcationMarkerLabel')} sub={t('glance.bifurcationMarkerSub')}>
            <Toggle value={settings.glance.showBifurcation} disabled={gbm}
              onChange={v => setGlance({ showBifurcation: v })} />
          </Row>
          <Row label={t('glance.logPanelLabel')} sub={t('glance.logPanelSub')}>
            <Toggle value={settings.glance.showLogPanel} disabled={gbm}
              onChange={v => setGlance({ showLogPanel: v })} />
          </Row>
          <Row label={t('glance.statusBadgePulseLabel')} sub={t('glance.statusBadgePulseSub')}>
            <Toggle value={settings.glance.statusBadgePulse} disabled={gbm}
              onChange={v => setGlance({ statusBadgePulse: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">{t('glance.visibleChartsSubsection')}</div>
          <Row label={t('glance.chartTps')}><Toggle value={settings.glance.showChartTps} onChange={v => setGlance({ showChartTps: v })} /></Row>
          <Row label={t('glance.chartTick')}><Toggle value={settings.glance.showChartTick} onChange={v => setGlance({ showChartTick: v })} /></Row>
          <Row label={t('glance.chartMem')}><Toggle value={settings.glance.showChartMem} onChange={v => setGlance({ showChartMem: v })} /></Row>
          <Row label={t('glance.chartCpu')}><Toggle value={settings.glance.showChartCpu} onChange={v => setGlance({ showChartCpu: v })} /></Row>

          <div className="s-divider" />
          <Row label={t('glance.refreshIntervalLabel')} sub={t('glance.refreshIntervalSub')}>
            <Slider value={settings.glance.refreshIntervalMs} min={500} max={10_000} step={500}
              fmt={v => `${(v / 1000).toFixed(1)}s`}
              onChange={v => setGlance({ refreshIntervalMs: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">{t('glance.gaugeZoneThresholdsSubsection')}</div>
          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 0 }}>{t('glance.tpsZoneHint')}</div>
          <Row label={<><ZoneDot color="#eab308" />{t('glance.tpsYellowBelowLabel')}</>} sub={t('glance.tpsYellowBelowSub')}>
            <Slider value={settings.glance.tpsYellowBelow} min={10} max={20} step={0.5}
              fmt={v => v.toFixed(1)} onChange={v => setGlance({ tpsYellowBelow: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />{t('glance.tpsOrangeBelowLabel')}</>}>
            <Slider value={settings.glance.tpsOrangeBelow} min={5} max={19} step={0.5}
              fmt={v => v.toFixed(1)} onChange={v => setGlance({ tpsOrangeBelow: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />{t('glance.tpsRedBelowLabel')}</>}>
            <Slider value={settings.glance.tpsRedBelow} min={1} max={15} step={0.5}
              fmt={v => v.toFixed(1)} onChange={v => setGlance({ tpsRedBelow: v })} />
          </Row>

          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 4 }}>{t('glance.msptZoneHint')}</div>
          <Row label={<><ZoneDot color="#eab308" />{t('glance.msptYellowAboveLabel')}</>}>
            <Slider value={settings.glance.msptYellowAbove} min={10} max={100} step={1}
              fmt={v => `${v}ms`} onChange={v => setGlance({ msptYellowAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />{t('glance.msptOrangeAboveLabel')}</>}>
            <Slider value={settings.glance.msptOrangeAbove} min={15} max={150} step={1}
              fmt={v => `${v}ms`} onChange={v => setGlance({ msptOrangeAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />{t('glance.msptRedAboveLabel')}</>}>
            <Slider value={settings.glance.msptRedAbove} min={20} max={200} step={1}
              fmt={v => `${v}ms`} onChange={v => setGlance({ msptRedAbove: v })} />
          </Row>

          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 4 }}>{t('glance.memZoneHint')}</div>
          <Row label={<><ZoneDot color="#eab308" />{t('glance.memYellowAboveLabel')}</>}>
            <Slider value={settings.glance.memYellowAbove} min={30} max={90} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ memYellowAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />{t('glance.memOrangeAboveLabel')}</>}>
            <Slider value={settings.glance.memOrangeAbove} min={50} max={95} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ memOrangeAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />{t('glance.memRedAboveLabel')}</>}>
            <Slider value={settings.glance.memRedAbove} min={60} max={99} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ memRedAbove: v })} />
          </Row>

          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 4 }}>{t('glance.cpuZoneHint')}</div>
          <Row label={<><ZoneDot color="#eab308" />{t('glance.cpuYellowAboveLabel')}</>}>
            <Slider value={settings.glance.cpuYellowAbove} min={20} max={85} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ cpuYellowAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />{t('glance.cpuOrangeAboveLabel')}</>}>
            <Slider value={settings.glance.cpuOrangeAbove} min={30} max={90} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ cpuOrangeAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />{t('glance.cpuRedAboveLabel')}</>}>
            <Slider value={settings.glance.cpuRedAbove} min={50} max={99} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ cpuRedAbove: v })} />
          </Row>

          <div className="s-subsection-label" style={{ fontSize: 9, color: 'var(--ghost)', paddingLeft: 14, paddingTop: 4 }}>{t('glance.diskZoneHint')}</div>
          <Row label={<><ZoneDot color="#eab308" />{t('glance.diskYellowAboveLabel')}</>}>
            <Slider value={settings.glance.diskYellowAbove} min={30} max={90} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ diskYellowAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#f97316" />{t('glance.diskOrangeAboveLabel')}</>}>
            <Slider value={settings.glance.diskOrangeAbove} min={50} max={95} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ diskOrangeAbove: v })} />
          </Row>
          <Row label={<><ZoneDot color="#ef4444" />{t('glance.diskRedAboveLabel')}</>}>
            <Slider value={settings.glance.diskRedAbove} min={60} max={99} step={1}
              fmt={v => `${v}%`} onChange={v => setGlance({ diskRedAbove: v })} />
          </Row>
        </Section>

        {/* ── Console ──────────────────────────────────────────────── */}
        <Section title={t('section.console')} icon={<IconTerminal size={13} />} sectionRef={refConsole}>
          <Row label={t('console.fontSizeLabel')}>
            <Slider value={settings.console.fontSize} min={10} max={18} step={0.5}
              fmt={v => `${v}px`} onChange={v => setConsole({ fontSize: v })} />
          </Row>
          <Row label={t('console.bufferLinesLabel')} sub={t('console.bufferLinesSub')}>
            <Slider value={settings.console.displayLines} min={500} max={10_000} step={500}
              fmt={v => v.toLocaleString()} onChange={v => setConsole({ displayLines: v })} />
          </Row>
          <Row label={t('console.wordWrapLabel')}>
            <Toggle value={settings.console.wordWrap} onChange={v => setConsole({ wordWrap: v })} />
          </Row>
          <Row label={t('console.showTimestampsLabel')} sub={t('console.showTimestampsSub')}>
            <Toggle value={settings.console.showTimestamps} onChange={v => setConsole({ showTimestamps: v })} />
          </Row>
        </Section>

        {/* ── Stats ────────────────────────────────────────────────── */}
        <Section title={t('section.stats')} icon={<IconSliders size={13} />} sectionRef={refStats}>
          <div className="s-subsection-label">{t('stats.defaultTimeRangeSubsection')}</div>
          <Row label={t('stats.defaultRangeLabel')} sub={t('stats.defaultRangeSub')}>
            <div className="s-seg">
              {(['1h', '6h', '24h', '7d'] as const).map(r => (
                <button key={r}
                  className={`s-seg-btn${settings.stats.defaultRange === r ? ' active' : ''}`}
                  onClick={() => setStats({ defaultRange: r })}>{r}</button>
              ))}
            </div>
          </Row>
          <div className="s-divider" />
          <div className="s-subsection-label">{t('stats.visibleChartsSubsection')}</div>
          <Row label={t('stats.tpsLabel')} sub={t('stats.tpsSub')}>
            <Toggle value={settings.stats.showChartTps} onChange={v => setStats({ showChartTps: v })} />
          </Row>
          <Row label={t('stats.msptLabel')} sub={t('stats.msptSub')}>
            <Toggle value={settings.stats.showChartMspt} onChange={v => setStats({ showChartMspt: v })} />
          </Row>
          <Row label={t('stats.playerCountLabel')} sub={t('stats.playerCountSub')}>
            <Toggle value={settings.stats.showChartPlayers} onChange={v => setStats({ showChartPlayers: v })} />
          </Row>
          <Row label={t('stats.entityCountLabel')} sub={t('stats.entityCountSub')}>
            <Toggle value={settings.stats.showChartEntities} onChange={v => setStats({ showChartEntities: v })} />
          </Row>
          <Row label={t('stats.loadedChunksLabel')} sub={t('stats.loadedChunksSub')}>
            <Toggle value={settings.stats.showChartChunks} onChange={v => setStats({ showChartChunks: v })} />
          </Row>
          <Row label={t('stats.pingPercentilesLabel')} sub={t('stats.pingPercentilesSub')}>
            <Toggle value={settings.stats.showChartPing} onChange={v => setStats({ showChartPing: v })} />
          </Row>

          <div className="s-divider" />
          <div className="s-subsection-label">{t('stats.zScoreOverlaySubsection')}</div>
          <Row label={t('stats.performanceOverlayLabel')} sub={t('stats.performanceOverlaySub')}>
            <Toggle value={settings.stats.showOverlayPerf} onChange={v => setStats({ showOverlayPerf: v })} />
          </Row>
          <Row label={t('stats.worldOverlayLabel')} sub={t('stats.worldOverlaySub')}>
            <Toggle value={settings.stats.showOverlayWorld} onChange={v => setStats({ showOverlayWorld: v })} />
          </Row>
          <Row label={t('stats.anomalyMarkersLabel')} sub={t('stats.anomalyMarkersSub')}>
            <Toggle value={settings.stats.overlayAnomalyMarkers} onChange={v => setStats({ overlayAnomalyMarkers: v })} />
          </Row>
          <Row label={t('stats.anomalyThresholdLabel')} sub={t('stats.anomalyThresholdSub')}>
            <Slider value={settings.stats.overlayAnomalyThreshold} min={1} max={5} step={0.5}
              fmt={v => `${v.toFixed(1)}σ`} onChange={v => setStats({ overlayAnomalyThreshold: v })} />
          </Row>
          <div className="s-divider" />
          <Row label={t('stats.correlationTableLabel')} sub={t('stats.correlationTableSub')}>
            <Toggle value={settings.stats.showCorrelation} onChange={v => setStats({ showCorrelation: v })} />
          </Row>
        </Section>

        {/* ── Command palette ───────────────────────────────────────── */}
        <Section title={t('section.commandPalette')} icon={<IconCommand size={13} />} sectionRef={refPalette}>
          <Row label={t('palette.enabledLabel')} sub={t('palette.enabledSub')}>
            <Toggle value={settings.palette.enabled} onChange={v => update({ palette: { enabled: v } })} />
          </Row>
        </Section>

        {/* ── Context wheel ────────────────────────────────────────── */}
        <Section title={t('section.contextWheel')} icon={<IconCommand size={13} />} sectionRef={refWheel}>
          <Row label={t('contextWheel.releaseToSelectLabel')} sub={t('contextWheel.releaseToSelectSub')}>
            <Toggle
              value={settings.contextWheel.releaseToSelect}
              onChange={v => setContextWheel({ releaseToSelect: v })}
            />
          </Row>
          <div className="s-divider" />
          <div className="s-subsection-label">{t('contextWheel.globalPanelActionsSubsection')}</div>
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
        <Section title={t('section.editor')} icon={<IconCode size={13} />} sectionRef={refEditor}>
          <Row label={t('editor.fontSizeLabel')}>
            <Slider value={settings.editor.fontSize} min={10} max={20} step={0.5}
              fmt={v => `${v}px`} onChange={v => setEditor({ fontSize: v })} />
          </Row>
          <Row label={t('editor.wordWrapLabel')}>
            <Toggle value={settings.editor.wordWrap} onChange={v => setEditor({ wordWrap: v })} />
          </Row>
          <Row label={t('editor.lineNumbersLabel')}>
            <Toggle value={settings.editor.lineNumbers} onChange={v => setEditor({ lineNumbers: v })} />
          </Row>
          <div className="s-divider" />
          <div className="s-subsection-label">{t('editor.intelligenceSubsection')}</div>
          <Row label={t('editor.smoothCaretLabel')} sub={t('editor.smoothCaretSub')}>
            <Toggle value={settings.editor.smoothCaret} onChange={v => setEditor({ smoothCaret: v })} />
          </Row>
          <Row label={t('editor.suggestionsLabel')} sub={t('editor.suggestionsSub')}>
            <Toggle value={settings.editor.suggestions} onChange={v => setEditor({ suggestions: v })} />
          </Row>
          <Row label={t('editor.validateLabel')} sub={t('editor.validateSub')}>
            <Toggle value={settings.editor.validate} onChange={v => setEditor({ validate: v })} />
          </Row>
          <Row label={t('editor.renderWhitespaceLabel')} sub={t('editor.renderWhitespaceSub')}>
            <Toggle value={settings.editor.renderWhitespace} onChange={v => setEditor({ renderWhitespace: v })} />
          </Row>
        </Section>

        {/* ── Reset ─────────────────────────────────────────────────── */}
        <div ref={refReset} className="s-footer">
          <button className="s-reset-btn" onClick={reset}>
            {t('reset.button')}
          </button>
        </div>
      </div>
    </div>
  )
}
