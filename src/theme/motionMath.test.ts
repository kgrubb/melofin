import { describe, expect, it } from 'vitest'
import {
  clamp01,
  scrubPositionFromX,
  scrubRatio,
} from '@/src/theme/motionMath'

describe('motionMath', () => {
  it('clamps ratios and maps scrub positions', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(scrubRatio(30_000, 60_000)).toBe(0.5)
    expect(scrubRatio(10, 0)).toBe(0)
    expect(scrubPositionFromX(50, 100, 200_000)).toBe(100_000)
    expect(scrubPositionFromX(10, 0, 1000)).toBe(0)
  })
})
