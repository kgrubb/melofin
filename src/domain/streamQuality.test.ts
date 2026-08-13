import { describe, expect, it } from 'vitest'
import {
  bitrateForPreset,
  defaultStreamQuality,
  isQualityPreset,
  parseStreamQuality,
  qualityPresetLabel,
  resolveStreamPreset,
} from '@/src/domain/streamQuality'

describe('streamQuality', () => {
  it('maps presets to bitrate', () => {
    expect(bitrateForPreset('low')).toBe(128_000)
    expect(bitrateForPreset('normal')).toBe(192_000)
    expect(bitrateForPreset('high')).toBe(320_000)
  })

  it('labels presets', () => {
    expect(qualityPresetLabel('low')).toContain('128')
    expect(qualityPresetLabel('normal')).toContain('192')
    expect(qualityPresetLabel('high')).toContain('320')
    expect(isQualityPreset('low')).toBe(true)
    expect(isQualityPreset('x')).toBe(false)
  })

  it('resolves automatic and manual network presets', () => {
    const auto = defaultStreamQuality()
    expect(resolveStreamPreset(auto, 'cellular')).toBe('normal')
    expect(resolveStreamPreset(auto, 'wifiLike')).toBe('high')
    expect(resolveStreamPreset(auto, 'offline')).toBe('high')
    const manual = {
      ...auto,
      automatic: false,
      wifi: 'low' as const,
      cellular: 'high' as const,
    }
    expect(resolveStreamPreset(manual, 'wifiLike')).toBe('low')
    expect(resolveStreamPreset(manual, 'cellular')).toBe('high')
  })

  it('parses persisted settings', () => {
    expect(parseStreamQuality({ automatic: false, wifi: 'low' })).toEqual({
      automatic: false,
      wifi: 'low',
      cellular: 'normal',
      download: 'high',
    })
    expect(parseStreamQuality({ wifi: 'nope' as unknown as undefined }).wifi).toBe(
      'high',
    )
    expect(parseStreamQuality(null)).toEqual(defaultStreamQuality())
  })
})
