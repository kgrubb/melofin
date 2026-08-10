/** Platform-agnostic audio session rules for reliable playback. */

/** expo-audio deactivates the session on pause unless this is set. */
export const KEEP_AUDIO_SESSION_ACTIVE = true

/** Volume / mute applied immediately before play(). */
export const PLAY_OUTPUT = {
  volume: 1,
  muted: false,
} as const

/**
 * Web replace() auto-plays if wasPlaying before the element has a source.
 * Native pause()-before-replace races session teardown with the next play().
 */
export const shouldPauseBeforeReplace = (platform: string): boolean =>
  platform === 'web'
