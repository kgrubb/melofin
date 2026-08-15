import { describe, expect, it } from 'vitest'
import {
  drawerOffsetY,
  expandedPlayerFrame,
  fallbackMiniFrame,
} from '@/src/player/nowPlayingGeometry'
import { chrome, spacing } from '@/src/theme/tokens'

describe('nowPlayingGeometry', () => {
  it('places the mini fallback above the tab chrome', () => {
    const frame = fallbackMiniFrame(390, 844, 34)
    expect(frame.x).toBe(chrome.tabBarMargin)
    expect(frame.width).toBe(390 - chrome.tabBarMargin * 2)
    expect(frame.height).toBe(chrome.miniHeight)
    expect(frame.y).toBe(
      844 - Math.max(34, spacing.sm) - chrome.miniBottomOffset - chrome.miniHeight,
    )
  })

  it('expands full-bleed to the screen', () => {
    const frame = expandedPlayerFrame(390, 844, 59, 34)
    expect(frame).toEqual({ x: 0, y: 0, width: 390, height: 844 })
  })

  it('slides the drawer with progress (no non-uniform scale)', () => {
    expect(drawerOffsetY(1, 844)).toBe(0)
    expect(drawerOffsetY(0, 844)).toBe(844)
    expect(drawerOffsetY(0.5, 844)).toBe(422)
    expect(drawerOffsetY(-1, 844)).toBe(844)
    expect(drawerOffsetY(2, 844)).toBe(0)
  })
})
