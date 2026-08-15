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
    x: chrome.tabBarMargin,
    y: screenHeight - bottom - chrome.miniHeight,
    width: Math.max(0, screenWidth - chrome.tabBarMargin * 2),
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

/**
 * Drawer dismiss: how far the sheet has traveled toward off-screen.
 * progress 1 = open (offset 0), progress 0 = fully dismissed (offset = height).
 */
export const drawerOffsetY = (
  progress: number,
  screenHeight: number,
): number => (1 - Math.min(1, Math.max(0, progress))) * screenHeight

/**
 * Uncover the live mini player once the sheet has slid far enough that the
 * dock is no longer fully covered (Apple sheet / drawer handoff).
 */
export const DOCK_REVEAL_PROGRESS = 0.55

/** Sheet fades out after dock reveal so the handoff isn’t a hard cut. */
export const SHEET_HANDOFF_FADE_MS = 140
