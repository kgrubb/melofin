import { describe, expect, it } from 'vitest'
import { mediaReachedEnd } from '@/src/player/playbackEnd'

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
})
