export type ReplayGainMode = 'off' | 'track' | 'album'

export const REPLAY_GAIN_MODES: readonly ReplayGainMode[] = [
  'off',
  'track',
  'album',
] as const

export const replayGainModeLabel = (mode: ReplayGainMode): string => {
  if (mode === 'off') return 'Off'
  if (mode === 'track') return 'Track'
  return 'Album'
}

export const isReplayGainMode = (value: unknown): value is ReplayGainMode =>
  value === 'off' || value === 'track' || value === 'album'

/**
 * ReplayGain dB → player volume in (0, 1].
 * iOS can't boost above unity — clamp positives to 1.
 */
export const volumeFromGainDb = (gainDb: number | undefined | null): number => {
  if (gainDb === undefined || gainDb === null || Number.isNaN(Number(gainDb))) {
    return 1
  }
  const linear = 10 ** (Number(gainDb) / 20)
  if (!Number.isFinite(linear)) return 1
  return Math.min(1, Math.max(0.05, linear))
}

export const pickNormalizationGain = (
  mode: ReplayGainMode,
  trackGain: number | undefined,
  albumGain: number | undefined,
): number | undefined => {
  if (mode === 'off') return undefined
  if (mode === 'album') return albumGain ?? trackGain
  return trackGain
}
