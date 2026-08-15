import { describe, expect, it } from 'vitest'
import {
  KEEP_AUDIO_SESSION_ACTIVE,
  PLAY_OUTPUT,
  REPLACE_LOAD_GRACE_MS,
  replaceLoadDecision,
  shouldPauseBeforeReplace,
  sourceIsLoaded,
} from '@/src/domain/audioSession'

describe('audioSession', () => {
  it('keeps the native session alive across pause/replace', () => {
    expect(KEEP_AUDIO_SESSION_ACTIVE).toBe(true)
  })

  it('forces audible output before play', () => {
    expect(PLAY_OUTPUT.volume).toBe(1)
    expect(PLAY_OUTPUT.muted).toBe(false)
  })

  it('only pauses before replace on web', () => {
    expect(shouldPauseBeforeReplace('web')).toBe(true)
    expect(shouldPauseBeforeReplace('ios')).toBe(false)
    expect(shouldPauseBeforeReplace('android')).toBe(false)
  })

  it('treats only isLoaded as ready (not playing/duration)', () => {
    expect(sourceIsLoaded({ isLoaded: true })).toBe(true)
    expect(sourceIsLoaded({ isLoaded: false })).toBe(false)
    expect(sourceIsLoaded({})).toBe(false)
  })

  it('does not accept replace() as loaded during grace or when failed', () => {
    expect(
      replaceLoadDecision({
        elapsedMs: 40,
        graceMs: REPLACE_LOAD_GRACE_MS,
        isLoaded: true,
      }),
    ).toBe('wait')
    expect(
      replaceLoadDecision({
        elapsedMs: 90,
        graceMs: REPLACE_LOAD_GRACE_MS,
        isLoaded: true,
      }),
    ).toBe('ready')
    expect(
      replaceLoadDecision({
        elapsedMs: 90,
        graceMs: REPLACE_LOAD_GRACE_MS,
        isLoaded: false,
      }),
    ).toBe('wait')
    expect(
      replaceLoadDecision({
        elapsedMs: 10,
        graceMs: REPLACE_LOAD_GRACE_MS,
        isLoaded: true,
        playbackState: 'failed',
      }),
    ).toBe('failed')
  })
})
