import { describe, expect, it } from 'vitest'
import {
  clamp01,
  scrubPositionFromX,
  scrubRatio,
  sheetBackdropOpacity,
  shouldDismissSheet,
} from '@/src/theme/motionMath'
import { motion } from '@/src/theme/tokens'

describe('motionMath', () => {
  it('clamps ratios and maps scrub positions', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(scrubRatio(30_000, 60_000)).toBe(0.5)
    expect(scrubRatio(10, 0)).toBe(0)
    expect(scrubPositionFromX(50, 100, 200_000)).toBe(100_000)
    expect(scrubPositionFromX(10, 0, 1000)).toBe(0)
  })

  it('decides sheet dismiss from distance or velocity', () => {
    expect(shouldDismissSheet(motion.sheet.dismissDistance + 1, 0)).toBe(true)
    expect(shouldDismissSheet(0, motion.sheet.dismissVelocity + 1)).toBe(true)
    expect(shouldDismissSheet(10, 10)).toBe(false)
  })

  it('computes backdrop opacity from progress and drag', () => {
    expect(sheetBackdropOpacity(1, 0, 800)).toBeCloseTo(0.55)
    expect(sheetBackdropOpacity(0, 0, 800)).toBe(0)
    expect(sheetBackdropOpacity(1, 400, 800)).toBeLessThan(0.55)
  })
})
