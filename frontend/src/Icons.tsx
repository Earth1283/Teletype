interface IconProps { size?: number; className?: string; style?: React.CSSProperties }
const s = (size = 16) => ({ width: size, height: size, strokeWidth: 1.5 })

export const IconCode = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
)

export const IconActivity = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)
export const IconTerminal = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)
export const IconUsers = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
export const IconCpu = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
  </svg>
)
export const IconFolder = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)
export const IconFile = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <polyline points="13 2 13 9 20 9" />
  </svg>
)
export const IconUpload = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
)
export const IconDownload = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="8 17 12 21 16 17" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
  </svg>
)
export const IconLink = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)
export const IconFolderPlus = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
  </svg>
)
export const IconPencil = ({ size = 14, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)
export const IconTrash = ({ size = 14, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)
export const IconSave = ({ size = 14, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
)
export const IconX = ({ size = 14, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
export const IconCopy = ({ size = 14, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)
export const IconCheck = ({ size = 14, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
export const IconRefresh = ({ size = 14, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)
export const IconLogOut = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)
export const IconChevronRight = ({ size = 12, className, style }: IconProps) => (
  <svg {...s(size)} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
)
export const IconChevronLeft = ({ size = 12, className, style }: IconProps) => (
  <svg {...s(size)} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
)
export const IconHeart = ({ size = 12, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)
export const IconGlobe = ({ size = 14, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)

export const IconZap = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)
export const IconPlay = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)
export const IconClock = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)
export const IconRepeat = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
)

export const IconSettings = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
export const IconSearch = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
export const IconCommand = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
  </svg>
)
export const IconList = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)
export const IconSliders = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
)
export const IconEyeOff = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)
export const IconPalette = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
    <circle cx="8.5"  cy="7.5"  r=".5" fill="currentColor"/>
    <circle cx="6.5"  cy="12.5" r=".5" fill="currentColor"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
  </svg>
)

export const IconNetwork = ({ size = 16, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <rect x="9" y="2" width="6" height="4" rx="1" />
    <rect x="2" y="18" width="6" height="4" rx="1" />
    <rect x="16" y="18" width="6" height="4" rx="1" />
    <line x1="12" y1="6" x2="12" y2="12" />
    <line x1="12" y1="12" x2="5" y2="18" />
    <line x1="12" y1="12" x2="19" y2="18" />
  </svg>
)

// Logo: stylized TTY terminal icon
export const TeletypeLogo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" style={{ color: 'var(--amber)' }}>
    <rect x="1" y="1" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 7l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="15" x2="18" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
