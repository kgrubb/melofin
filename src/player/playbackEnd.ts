/** Prefer a finite positive duration. Fall back when native is unknown. */
export const effectiveDurationSec = (
  nativeDurationSec: number,
  fallbackDurationSec?: number,
): number => {
  if (Number.isFinite(nativeDurationSec) && nativeDurationSec > 0) {
    return nativeDurationSec
  }
  if (
    fallbackDurationSec != null &&
    Number.isFinite(fallbackDurationSec) &&
    fallbackDurationSec > 0
  ) {
    return fallbackDurationSec
  }
  return 0
}

export const mediaReachedEnd = ({
  isPlayingIntent,
  mediaPlaying,
  currentTimeSec,
  durationSec,
  fallbackDurationSec,
  uiPositionMs,
}: {
  readonly isPlayingIntent: boolean
  readonly mediaPlaying: boolean
  readonly currentTimeSec: number
  readonly durationSec: number
  /** Jellyfin/catalog duration when native player duration is 0/NaN. */
  readonly fallbackDurationSec?: number
  /**
   * Store scrubber position. After goNext this is 0 while native may still be
   * sitting on the prior item's EOF. That must not count as end-of-track.
   */
  readonly uiPositionMs?: number
}): boolean => {
  if (!isPlayingIntent || mediaPlaying) return false
  if (!Number.isFinite(currentTimeSec) || currentTimeSec < 0) return false
  // New/reset track in the store while native is still on the previous item.
  if (
    uiPositionMs != null &&
    uiPositionMs < 2000 &&
    currentTimeSec > 5
  ) {
    return false
  }
  const duration = effectiveDurationSec(durationSec, fallbackDurationSec)
  if (duration <= 0) return false
  // Reject stale previous-item times after a skip to a shorter track.
  if (currentTimeSec > duration + 1.5) return false
  return currentTimeSec >= duration - 0.35
}
