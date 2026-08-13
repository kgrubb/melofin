import { describe, expect, it } from 'vitest'
import {
  pickNormalizationGain,
  replayGainModeLabel,
  volumeFromGainDb,
} from '@/src/domain/replayGain'

describe('replayGain', () => {
  it('maps gain dB to volume without boosting past 1', () => {
    expect(volumeFromGainDb(0)).toBe(1)
    expect(volumeFromGainDb(-6)).toBeCloseTo(0.501, 2)
    expect(volumeFromGainDb(3)).toBe(1)
    expect(volumeFromGainDb(undefined)).toBe(1)
    expect(volumeFromGainDb(Number.NaN)).toBe(1)
  })

  it('picks track vs album gain', () => {
    expect(pickNormalizationGain('off', -3, -1)).toBeUndefined()
    expect(pickNormalizationGain('track', -3, -1)).toBe(-3)
    expect(pickNormalizationGain('album', -3, -1)).toBe(-1)
    expect(pickNormalizationGain('album', -3, undefined)).toBe(-3)
  })

  it('labels modes', () => {
    expect(replayGainModeLabel('off')).toBe('Off')
    expect(replayGainModeLabel('track')).toBe('Track')
    expect(replayGainModeLabel('album')).toBe('Album')
  })
})
