import type { MiniPlayerFrame } from '@/src/store/player'
import { chrome, spacing } from '@/src/theme/tokens'

/** Fallback when the mini player has not measured yet. */
export const fallbackMiniFrame = (
  screenWidth: number,
  screenHeight: number,
  bottomInset: number,
): MiniPlayerFrame => {
  const bottom = Math.max(bottomInset, spacing.sm) + chrome.miniBottomOffset
  return {
    x: spacing.md,
    y: screenHeight - bottom - chrome.miniHeight,
    width: Math.max(0, screenWidth - spacing.md * 2),
    height: chrome.miniHeight,
  }
}

/** Expanded Now Playing fills the screen (content pads for safe area). */
export const expandedPlayerFrame = (
  screenWidth: number,
  screenHeight: number,
  _topInset: number,
  _bottomInset: number,
): MiniPlayerFrame => ({
  x: 0,
  y: 0,
  width: screenWidth,
  height: screenHeight,
})

/** Expanded controls fade out before the sheet is heavily scaled. */
export const EXPANDED_CONTENT_FADE = {
  start: 0.42,
  end: 0.68,
} as const

/**
 * Mini chrome clone fades in so the morph ends as a filled mini player,
 * not a blank card (Apple Music-style continuous surface).
 */
export const MINI_CONTENT_FADE = {
  start: 0.12,
  end: 0.42,
} as const

/** Uncover the live dock once the sheet is mostly mini, then fade the morph away. */
export const DOCK_REVEAL_PROGRESS = 0.34

/** Morph sheet fades out after dock reveal so opaque card → glass isn't a hard cut. */
export const SHEET_HANDOFF_FADE_MS = 120

export const sheetContentOpacity = (progress: number): number => {
  const { start, end } = EXPANDED_CONTENT_FADE
  if (progress <= start) return 0
  if (progress >= end) return 1
  return (progress - start) / (end - start)
}

export const miniChromeOpacity = (progress: number): number => {
  const { start, end } = MINI_CONTENT_FADE
  if (progress <= start) return 1
  if (progress >= end) return 0
  return 1 - (progress - start) / (end - start)
}
