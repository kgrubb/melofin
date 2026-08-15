export const clamp01 = (value: number): number => {
  'worklet'
  return Math.min(1, Math.max(0, value))
}

export const scrubRatio = (positionMs: number, durationMs: number): number => {
  'worklet'
  return durationMs > 0 ? clamp01(positionMs / durationMs) : 0
}

/**
 * True for a real seek/skip, not the engine's ~500ms sync tick.
 * Compares against the interpolated position from the last anchor.
 */
export const isPlaybackJump = (
  positionMs: number,
  lastAnchorMs: number,
  lastAnchorAt: number,
  now: number,
  isPlaying: boolean,
  thresholdMs = 750,
): boolean => {
  const expected = isPlaying
    ? lastAnchorMs + Math.max(0, now - lastAnchorAt)
    : lastAnchorMs
  return Math.abs(positionMs - expected) > thresholdMs
}

export const scrubPositionFromX = (
  x: number,
  width: number,
  durationMs: number,
): number => {
  'worklet'
  if (width <= 0 || durationMs <= 0) return 0
  return Math.round(clamp01(x / width) * durationMs)
}
