import { describe, expect, it } from 'vitest'
import {
  clamp01,
  isPlaybackJump,
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

  it('treats engine sync ticks as continuous, not jumps', () => {
    const at = 1_000
    expect(isPlaybackJump(10_500, 10_000, at, at + 500, true)).toBe(false)
    expect(isPlaybackJump(10_400, 10_000, at, at + 500, true)).toBe(false)
    expect(isPlaybackJump(20_000, 10_000, at, at + 500, true)).toBe(true)
    expect(isPlaybackJump(0, 10_000, at, at + 100, true)).toBe(true)
  })
})
