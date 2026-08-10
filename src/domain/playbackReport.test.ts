import { describe, expect, it } from 'vitest'
import {
  buildPlaybackProgressBody,
  buildPlaybackStartBody,
  buildPlaybackStopBody,
  planTransport,
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

describe('planTransport scrobble intents', () => {
  it('pause reports progress only — never mints a session', () => {
    const plan = planTransport({
      wasPlaying: true,
      isPlaying: false,
      trackChanged: false,
      hasPlaySession: true,
    })
    expect(plan).toEqual({
      kind: 'pause',
      mintSession: false,
      reportStart: false,
      reportProgress: true,
      play: false,
      pause: true,
    })
  })

  it('unpause resumes the same session via progress, not PlaybackStart', () => {
    const plan = planTransport({
      wasPlaying: false,
      isPlaying: true,
      trackChanged: false,
      hasPlaySession: true,
    })
    expect(plan).toEqual({
      kind: 'resume',
      mintSession: false,
      reportStart: false,
      reportProgress: true,
      play: true,
      pause: false,
    })
  })

  it('first play mints a session and reports start', () => {
    const plan = planTransport({
      wasPlaying: false,
      isPlaying: true,
      trackChanged: true,
      hasPlaySession: false,
    })
    expect(plan.kind).toBe('start')
    expect(plan.mintSession).toBe(true)
    expect(plan.reportStart).toBe(true)
    expect(plan.play).toBe(true)
  })

  it('skip while playing starts a new scrobble session', () => {
    const plan = planTransport({
      wasPlaying: true,
      isPlaying: true,
      trackChanged: true,
      hasPlaySession: true,
    })
    expect(plan.kind).toBe('start')
    expect(plan.mintSession).toBe(true)
    expect(plan.reportStart).toBe(true)
  })

  it('track change while paused only loads', () => {
    expect(
      planTransport({
        wasPlaying: false,
        isPlaying: false,
        trackChanged: true,
        hasPlaySession: true,
      }).kind,
    ).toBe('load')
  })

  it('play after a paused skip starts fresh (session cleared by engine load)', () => {
    // Engine clears playSessionId on load; the subsequent play sees no session.
    const plan = planTransport({
      wasPlaying: false,
      isPlaying: true,
      trackChanged: false,
      hasPlaySession: false,
    })
    expect(plan.kind).toBe('start')
    expect(plan.mintSession).toBe(true)
  })

  it('idle when nothing relevant changed', () => {
    expect(
      planTransport({
        wasPlaying: true,
        isPlaying: true,
        trackChanged: false,
        hasPlaySession: true,
      }).kind,
    ).toBe('idle')
  })
})
