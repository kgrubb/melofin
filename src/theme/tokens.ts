export const colors = {
  background: '#08040F',
  surface: 'rgba(255, 255, 255, 0.07)',
  elevated: 'rgba(255, 255, 255, 0.10)',
  text: '#F8F4FF',
  textSecondary: 'rgba(232, 220, 255, 0.62)',
  accent: '#D946EF',
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

/** Floating tab bar + mini player. */
const tabBarHeight = 62
export const chrome = {
  tabBarHeight,
  tabBarMargin: 21,
  tabBarInset: 4,
  /** Tab platter + gap to the mini-player accessory. */
  miniBottomOffset: tabBarHeight + spacing.sm,
  miniHeight: 64,
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

export const motion = {
  spring: {
    // Soft press keeps Blur/glass from jittering.
    press: { damping: 22, stiffness: 260, mass: 0.6 },
    selection: { damping: 24, stiffness: 240, mass: 0.7 },
    sheet: { damping: 26, stiffness: 220, mass: 0.9 },
  },
  duration: {
    fast: 120,
    ui: 240,
    sheet: 360,
    settle: 160,
  },
  scale: {
    button: 0.97,
    card: 0.985,
  },
  sheet: {
    dismissProgress: 0.82,
    dismissVelocity: 900,
    dismissDistance: 280,
  },
} as const
