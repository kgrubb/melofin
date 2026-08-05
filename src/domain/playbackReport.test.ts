import { describe, expect, it } from 'vitest'
import {
  buildPlaybackProgressBody,
  buildPlaybackStartBody,
  buildPlaybackStopBody,
  shouldFlushProgress,
} from '@/src/domain/playbackReport'

describe('playback report payloads', () => {
  const input = {
    itemId: '1',
    mediaSourceId: 'm',
    playSessionId: 'p',
    positionTicks: 100,
    isPaused: false,
    canSeek: true,
    playMethod: 'DirectPlay' as const,
  }

  it('builds start progress and stop bodies', () => {
    expect(buildPlaybackStartBody(input).ItemId).toBe('1')
    expect(buildPlaybackProgressBody(input).PlaySessionId).toBe('p')
    expect(buildPlaybackStopBody(input).PositionTicks).toBe(100)
  })

  it('flushes progress on interval', () => {
    expect(shouldFlushProgress(0, 10_000)).toBe(true)
    expect(shouldFlushProgress(0, 999)).toBe(false)
  })
})
