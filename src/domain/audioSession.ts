/** expo-audio deactivates the session on pause unless this is set. */
export const KEEP_AUDIO_SESSION_ACTIVE = true

export const PLAY_OUTPUT = {
  volume: 1,
  muted: false,
} as const

/**
 * Web replace() auto-plays if wasPlaying before the element has a source.
 * Native replace does not auto-play (Now Playing + seek-then-play).
 */
export const shouldPauseBeforeReplace = (platform: string): boolean =>
  platform === 'web'

/** Ignore prior-item status events still in flight after replace(). */
export const REPLACE_LOAD_GRACE_MS = 80

/** Only `isLoaded` means the current source is ready, not playing/duration. */
export const sourceIsLoaded = (snapshot: {
  readonly isLoaded?: boolean
}): boolean => Boolean(snapshot.isLoaded)

export type ReplaceLoadDecision = 'wait' | 'ready' | 'failed'

/**
 * After replace(), do not treat `playing` as loaded. That is the previous
 * item. Fail immediately when AVPlayer reports `failed`.
 */
export const replaceLoadDecision = (input: {
  readonly elapsedMs: number
  readonly graceMs: number
  readonly isLoaded: boolean
  readonly playbackState?: string
}): ReplaceLoadDecision => {
  const state = (input.playbackState ?? '').toLowerCase()
  if (state === 'failed') return 'failed'
  if (input.elapsedMs < input.graceMs) return 'wait'
  if (input.isLoaded) return 'ready'
  return 'wait'
}
