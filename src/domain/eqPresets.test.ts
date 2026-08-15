import { describe, expect, it } from 'vitest'
import {
  defaultEqSettings,
  effectiveEqGains,
  eqPresetLabel,
  fiveBandGainsFromTen,
  FLAT_EQ_GAINS,
  normalizeEqGains,
  parseEqSettings,
  setFiveBandGain,
} from '@/src/domain/eqPresets'

describe('eqPresets', () => {
  it('defaults flat/disabled and clamps gains', () => {
    expect(defaultEqSettings()).toEqual({
      enabled: false,
      presetId: 'flat',
      gainsDb: FLAT_EQ_GAINS,
    })
    expect(normalizeEqGains([100, -100])).toEqual([
      24, -24, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
    expect(effectiveEqGains(defaultEqSettings())).toEqual(FLAT_EQ_GAINS)
    expect(
      effectiveEqGains({
        enabled: true,
        presetId: 'bassBoost',
        gainsDb: FLAT_EQ_GAINS,
      })[0],
    ).toBe(6)
  })

  it('parses settings and labels presets', () => {
    expect(parseEqSettings({ enabled: true, presetId: 'vocal' }).presetId).toBe(
      'vocal',
    )
    expect(parseEqSettings({ enabled: true, presetId: 'custom', gainsDb: [1] }).gainsDb[0]).toBe(
      1,
    )
    expect(parseEqSettings(null)).toEqual(defaultEqSettings())
    expect(eqPresetLabel('trebleBoost')).toBe('Treble boost')
    expect(eqPresetLabel('flat')).toBe('Flat')
    expect(eqPresetLabel('bassBoost')).toBe('Bass boost')
    expect(eqPresetLabel('vocal')).toBe('Vocal')
    expect(eqPresetLabel('custom')).toBe('Custom')
    expect(
      effectiveEqGains({
        enabled: true,
        presetId: 'custom',
        gainsDb: normalizeEqGains([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      })[9],
    ).toBe(10)
  })

  it('maps five visual bands onto the ten-band curve', () => {
    const gains = normalizeEqGains([6, 4, 0, 0, 0, 0, 0, 0, -2, -4])
    expect(fiveBandGainsFromTen(gains)[0]).toBe(5)
    expect(fiveBandGainsFromTen(gains)[4]).toBe(-3)
    const next = setFiveBandGain(gains, 2, 8)
    expect(next[4]).toBe(8)
    expect(next[5]).toBe(8)
  })
})
