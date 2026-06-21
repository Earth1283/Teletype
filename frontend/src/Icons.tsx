interface IconProps { size?: number; className?: string }
const s = (size = 16) => ({ width: size, height: size, strokeWidth: 1.5 })

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
export const IconChevronRight = ({ size = 12, className }: IconProps) => (
  <svg {...s(size)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <polyline points="9 18 15 12 9 6" />
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

// Logo: stylized TTY terminal icon
export const TeletypeLogo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
    <rect x="1" y="1" width="20" height="20" rx="4" stroke="#f59e0b" strokeWidth="1.5" />
    <path d="M5 7l4 4-4 4" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="15" x2="18" y2="15" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
