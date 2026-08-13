import { describe, expect, it } from 'vitest'
import { effectiveDurationSec, mediaReachedEnd } from '@/src/player/playbackEnd'

describe('mediaReachedEnd', () => {
  it('detects intentional end-of-track', () => {
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: false,
        currentTimeSec: 120,
        durationSec: 120,
      }),
    ).toBe(true)
  })

  it('ignores pause mid-track or idle', () => {
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: false,
        currentTimeSec: 30,
        durationSec: 120,
      }),
    ).toBe(false)
    expect(
      mediaReachedEnd({
        isPlayingIntent: false,
        mediaPlaying: false,
        currentTimeSec: 120,
        durationSec: 120,
      }),
    ).toBe(false)
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: true,
        currentTimeSec: 120,
        durationSec: 120,
      }),
    ).toBe(false)
  })

  it('uses Jellyfin fallback when native duration is unknown', () => {
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: false,
        currentTimeSec: 179.8,
        durationSec: 0,
        fallbackDurationSec: 180,
        uiPositionMs: 179_500,
      }),
    ).toBe(true)
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: false,
        currentTimeSec: 179.8,
        durationSec: Number.NaN,
        fallbackDurationSec: 180,
        uiPositionMs: 179_500,
      }),
    ).toBe(true)
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: false,
        currentTimeSec: 90,
        durationSec: 0,
        fallbackDurationSec: 180,
        uiPositionMs: 90_000,
      }),
    ).toBe(false)
  })

  it('rejects stale previous-item time after a skip to a shorter track', () => {
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: false,
        currentTimeSec: 180,
        durationSec: 0,
        fallbackDurationSec: 60,
        uiPositionMs: 0,
      }),
    ).toBe(false)
  })

  it('rejects native EOF while the store was reset for the next track', () => {
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: false,
        currentTimeSec: 180,
        durationSec: 180,
        uiPositionMs: 0,
      }),
    ).toBe(false)
  })

  it('does not treat missing durations as end', () => {
    expect(
      mediaReachedEnd({
        isPlayingIntent: true,
        mediaPlaying: false,
        currentTimeSec: 10,
        durationSec: 0,
      }),
    ).toBe(false)
  })
})

describe('effectiveDurationSec', () => {
  it('prefers native then fallback', () => {
    expect(effectiveDurationSec(120, 180)).toBe(120)
    expect(effectiveDurationSec(0, 180)).toBe(180)
    expect(effectiveDurationSec(Number.NaN, 180)).toBe(180)
    expect(effectiveDurationSec(0, 0)).toBe(0)
  })
})
