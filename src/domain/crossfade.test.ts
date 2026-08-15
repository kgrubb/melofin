import { describe, expect, it } from 'vitest'
import {
  crossfadeLabel,
  localHandoffMode,
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

  it('treats crossfade off as gapless handoff', () => {
    expect(localHandoffMode(0)).toBe('gapless')
    expect(localHandoffMode(5)).toBe('crossfade')
    expect(localHandoffMode(12)).toBe('crossfade')
  })
})
