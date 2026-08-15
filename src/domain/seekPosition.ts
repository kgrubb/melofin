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
  /** Native never reached the target. Caller should re-issue seekTo. */
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

/** Near-start reports that should not wipe a mid-track UI position. */
const SPURIOUS_START_MS = 500
const MID_TRACK_MS = 2000
/** Drop this far toward the start without a seek -> likely replace/reset glitch. */
const BACKWARD_JUMP_MS = 2000

/**
 * Progress polls often keep reporting the pre-seek time (or 0) until the
 * native player settles. Accepting those makes the scrubber flash/snap back.
 */
export const acceptReportedPosition = (
  guard: SeekGuard,
  reported: number,
  uiPositionMs: number,
  now: number,
  toleranceMs = 1250,
): SeekDecision => {
  if (!Number.isFinite(reported) || reported < 0) {
    return {
      accept: false,
      positionMs: uiPositionMs,
      guard,
      retrySeek: false,
    }
  }

  if (guard.targetMs == null) {
    // After goNext the store is at 0 while the prior item may still be at EOF.
    if (uiPositionMs < SPURIOUS_START_MS && reported > MID_TRACK_MS) {
      return {
        accept: false,
        positionMs: uiPositionMs,
        guard,
        retrySeek: false,
      }
    }
    // Native reset near 0 mid-track. Hold UI and re-seek to the known position.
    if (reported < SPURIOUS_START_MS && uiPositionMs > MID_TRACK_MS) {
      return {
        accept: false,
        positionMs: uiPositionMs,
        guard: beginSeekGuard(uiPositionMs, now),
        retrySeek: true,
      }
    }
    // Large unexplained backward jumps (network blip reload that landed near 0).
    if (
      uiPositionMs - reported > BACKWARD_JUMP_MS &&
      reported < uiPositionMs * 0.5
    ) {
      return {
        accept: false,
        positionMs: uiPositionMs,
        guard: beginSeekGuard(uiPositionMs, now),
        retrySeek: true,
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
    // Never accept a stale pre-seek report. That snaps scrubbing backwards.
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
