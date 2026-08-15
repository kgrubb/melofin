import { describe, expect, it } from 'vitest'
import {
  crossfadeLabel,
  normalizeCrossfadeSeconds,
} from '@/src/domain/crossfade'

describe('crossfade', () => {
  it('normalizes to allowed presets', () => {
    expect(normalizeCrossfadeSeconds(0)).toBe(0)
    expect(normalizeCrossfadeSeconds(5)).toBe(5)
    expect(normalizeCrossfadeSeconds(8)).toBe(8)
    expect(normalizeCrossfadeSeconds(12)).toBe(12)
    expect(normalizeCrossfadeSeconds(7)).toBe(0)
    expect(normalizeCrossfadeSeconds('8')).toBe(8)
    expect(normalizeCrossfadeSeconds(undefined)).toBe(0)
  })

  it('labels presets', () => {
    expect(crossfadeLabel(0)).toBe('Off')
    expect(crossfadeLabel(12)).toBe('12s')
  })
})
