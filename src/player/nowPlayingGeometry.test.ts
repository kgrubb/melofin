import { describe, expect, it } from 'vitest'
import {
  expandedPlayerFrame,
  fallbackMiniFrame,
  miniChromeOpacity,
  sheetContentOpacity,
} from '@/src/player/nowPlayingGeometry'
import { chrome, spacing } from '@/src/theme/tokens'

describe('nowPlayingGeometry', () => {
  it('places the mini fallback above the tab chrome', () => {
    const frame = fallbackMiniFrame(390, 844, 34)
    expect(frame.x).toBe(spacing.md)
    expect(frame.width).toBe(390 - spacing.md * 2)
    expect(frame.height).toBe(chrome.miniHeight)
    expect(frame.y).toBe(
      844 - Math.max(34, spacing.sm) - chrome.miniBottomOffset - chrome.miniHeight,
    )
  })

  it('expands full-bleed to the screen', () => {
    const frame = expandedPlayerFrame(390, 844, 59, 34)
    expect(frame).toEqual({ x: 0, y: 0, width: 390, height: 844 })
  })

  it('crossfades expanded controls vs mini chrome during the morph', () => {
    expect(sheetContentOpacity(0)).toBe(0)
    expect(sheetContentOpacity(0.42)).toBe(0)
    expect(sheetContentOpacity(1)).toBe(1)
    expect(sheetContentOpacity(0.55)).toBeGreaterThan(0)
    expect(sheetContentOpacity(0.55)).toBeLessThan(1)

    expect(miniChromeOpacity(0)).toBe(1)
    expect(miniChromeOpacity(0.42)).toBe(0)
    expect(miniChromeOpacity(1)).toBe(0)
    expect(miniChromeOpacity(0.27)).toBeGreaterThan(0)
    expect(miniChromeOpacity(0.27)).toBeLessThan(1)
  })
})
