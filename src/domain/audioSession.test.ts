import { describe, expect, it } from 'vitest'
import {
  KEEP_AUDIO_SESSION_ACTIVE,
  PLAY_OUTPUT,
  shouldPauseBeforeReplace,
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
})
