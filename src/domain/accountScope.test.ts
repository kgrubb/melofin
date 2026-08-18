import { describe, expect, it } from 'vitest'
import {
  accountScopeKey,
  isLegacyOfflineAudioPath,
  scopedAudioRelativePath,
  scopedLyricsRelativePath,
  scopedOfflineIndexRelativePath,
  scopedPacksRelativePath,
  stableHash,
  unitRandomFromSeed,
} from '@/src/domain/accountScope'

describe('accountScope', () => {
  it('hashes stably and builds scope keys/paths', () => {
    expect(stableHash('https://jf.example')).toBe(stableHash('https://jf.example'))
    expect(stableHash('a')).not.toBe(stableHash('b'))
    const key = accountScopeKey({
      serverUrl: 'https://jf.example',
      userId: 'u1',
    })
    expect(key).toMatch(/^[0-9a-f]+:u1$/)
    expect(scopedAudioRelativePath(key, 'track')).toBe(
      `scopes/${key}/audio/track`,
    )
    expect(scopedAudioRelativePath(key, 'track', 'flac')).toBe(
      `scopes/${key}/audio/track.flac`,
    )
    expect(scopedOfflineIndexRelativePath(key)).toBe(
      `scopes/${key}/offline-index.json`,
    )
    expect(scopedPacksRelativePath(key)).toBe(`scopes/${key}/packs.json`)
    expect(scopedLyricsRelativePath(key, 'track')).toBe(
      `scopes/${key}/lyrics/track.json`,
    )
  })

  it('yields a stable unit sequence from a seed', () => {
    const a = unitRandomFromSeed('jazz|rock')
    const b = unitRandomFromSeed('jazz|rock')
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true)
    expect(unitRandomFromSeed('pop')()).not.toBe(first[0])
  })

  it('detects legacy offline audio paths', () => {
    expect(isLegacyOfflineAudioPath('audio/abc')).toBe(true)
    expect(isLegacyOfflineAudioPath('scopes/x/audio/abc')).toBe(false)
    expect(isLegacyOfflineAudioPath('file:///tmp/x')).toBe(true)
  })
})
