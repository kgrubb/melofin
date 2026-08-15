import type { MiniPlayerFrame } from '@/src/store/player'
import { chrome, spacing } from '@/src/theme/tokens'

export const fallbackMiniFrame = (
  screenWidth: number,
  screenHeight: number,
  bottomInset: number,
): MiniPlayerFrame => {
  const bottom = Math.max(bottomInset, spacing.sm) + chrome.miniBottomOffset
  return {
    x: chrome.tabBarMargin,
    y: screenHeight - bottom - chrome.miniHeight,
    width: Math.max(0, screenWidth - chrome.tabBarMargin * 2),
    height: chrome.miniHeight,
  }
}

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

/** progress 1 = open (offset 0), 0 = fully dismissed (offset = height). */
export const drawerOffsetY = (
  progress: number,
  screenHeight: number,
): number => (1 - Math.min(1, Math.max(0, progress))) * screenHeight

/** Uncover the mini player once the sheet no longer fully covers the dock. */
export const DOCK_REVEAL_PROGRESS = 0.55

export const SHEET_HANDOFF_FADE_MS = 140
