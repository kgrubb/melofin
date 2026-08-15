/** Allowed Spotify-style crossfade durations (seconds). 0 = off. */
export const CROSSFADE_PRESETS = [0, 5, 8, 12] as const
export type CrossfadeSeconds = (typeof CROSSFADE_PRESETS)[number]

export const normalizeCrossfadeSeconds = (value: unknown): CrossfadeSeconds => {
  const n = typeof value === 'number' ? value : Number(value)
  if (n === 5 || n === 8 || n === 12) return n
  return 0
}

export const crossfadeLabel = (seconds: CrossfadeSeconds): string => {
  if (seconds === 0) return 'Off'
  return `${seconds}s`
}
