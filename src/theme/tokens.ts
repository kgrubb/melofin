export const colors = {
  background: '#08040F',
  surface: 'rgba(255, 255, 255, 0.06)',
  elevated: 'rgba(255, 255, 255, 0.10)',
  text: '#F8F4FF',
  textSecondary: 'rgba(232, 220, 255, 0.62)',
  accent: '#D946EF',
  accentSecondary: '#A855F7',
  accentDeep: '#7C3AED',
  danger: '#FB7185',
  border: 'rgba(255, 255, 255, 0.10)',
  glassBorder: 'rgba(255, 255, 255, 0.18)',
  onAccent: '#FFFFFF',
  hairline: 'rgba(255, 255, 255, 0.08)',
} as const

export const gradients = {
  brand: ['#9333EA', '#D946EF', '#FB7185'] as const,
  wash: ['#14081F', '#08040F', '#0C0618'] as const,
  glow: ['rgba(147, 51, 234, 0.28)', 'rgba(217, 70, 239, 0.12)', 'transparent'] as const,
  card: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)'] as const,
} as const

export const radii = {
  sm: 14,
  md: 20,
  lg: 28,
  xl: 36,
  pill: 999,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

/** Floating tab bar + mini player — scroll content under glass. */
export const chrome = {
  tabBarHeight: 74,
  /** Distance from safe bottom to mini bottom edge (tab height + gap). */
  miniBottomOffset: 82,
  miniHeight: 60,
} as const

/** Extra list/scroll padding so last rows clear the floating chrome. */
export const scrollUnderChromePad = (
  safeBottom = 0,
  opts?: { readonly tabBar?: boolean },
): number => {
  const tabBar = opts?.tabBar !== false
  const miniOffset = tabBar ? chrome.miniBottomOffset : spacing.md
  return Math.max(safeBottom, spacing.sm) + miniOffset + chrome.miniHeight + spacing.md
}
export const typography = {
  brand: {
    fontSize: 52,
    fontWeight: '700' as const,
    letterSpacing: -2,
  },
  title: {
    fontSize: 34,
    fontWeight: '700' as const,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    letterSpacing: -0.1,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    letterSpacing: 0.15,
  },
}

/** Shared motion language — Melio liquid glass. */
export const motion = {
  spring: {
    press: { damping: 28, stiffness: 420, mass: 0.55 },
    selection: { damping: 24, stiffness: 280, mass: 0.7 },
    sheet: { damping: 26, stiffness: 220, mass: 0.85 },
  },
  duration: {
    fast: 140,
    ui: 280,
    sheet: 380,
    settle: 180,
  },
  scale: {
    button: 0.96,
    card: 0.98,
  },
  sheet: {
    dismissDistance: 140,
    dismissVelocity: 900,
  },
} as const
