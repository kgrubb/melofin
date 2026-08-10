/** Ignore stale player.currentTime while a seek is in flight. */

export type SeekGuard = {
  readonly targetMs: number | null
  readonly until: number
  readonly retries: number
}

export type SeekDecision = {
  readonly accept: boolean
  readonly positionMs: number
  readonly guard: SeekGuard
  /** Native never reached the target — caller should re-issue seekTo. */
  readonly retrySeek: boolean
}

export const idleSeekGuard = (): SeekGuard => ({
  targetMs: null,
  until: 0,
  retries: 0,
})

export const beginSeekGuard = (
  targetMs: number,
  now: number,
  windowMs = 2000,
  retries = 0,
): SeekGuard => ({
  targetMs: Math.max(0, targetMs),
  until: now + windowMs,
  retries,
})

const MAX_SEEK_RETRIES = 3

/**
 * Progress polls often keep reporting the pre-seek time (or 0) until the
 * native player settles — accepting those makes the scrubber flash/snap back.
 */
export const acceptReportedPosition = (
  guard: SeekGuard,
  reported: number,
  uiPositionMs: number,
  now: number,
  toleranceMs = 1250,
): SeekDecision => {
  if (guard.targetMs == null) {
    // expo-audio sometimes reports 0 across a replace/seek boundary.
    if (reported === 0 && uiPositionMs > 2000) {
      return {
        accept: false,
        positionMs: uiPositionMs,
        guard,
        retrySeek: false,
      }
    }
    return { accept: true, positionMs: reported, guard, retrySeek: false }
  }

  if (Math.abs(reported - guard.targetMs) <= toleranceMs) {
    return {
      accept: true,
      positionMs: reported,
      guard: idleSeekGuard(),
      retrySeek: false,
    }
  }

  if (now >= guard.until) {
    // Never accept a stale pre-seek report — that snaps scrubbing backwards.
    if (guard.retries >= MAX_SEEK_RETRIES) {
      return {
        accept: true,
        positionMs: guard.targetMs,
        guard: idleSeekGuard(),
        retrySeek: false,
      }
    }
    return {
      accept: true,
      positionMs: guard.targetMs,
      guard: beginSeekGuard(guard.targetMs, now, 2000, guard.retries + 1),
      retrySeek: true,
    }
  }

  return {
    accept: false,
    positionMs: guard.targetMs,
    guard,
    retrySeek: false,
  }
}
