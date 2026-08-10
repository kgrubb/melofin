/** Clamp a 0–1 progress ratio. */
export const clamp01 = (value: number): number => {
  'worklet'
  return Math.min(1, Math.max(0, value))
}

/** Position as a fraction of duration. */
export const scrubRatio = (positionMs: number, durationMs: number): number => {
  'worklet'
  return durationMs > 0 ? clamp01(positionMs / durationMs) : 0
}

/** Map a touch X within a track width to a seek position in ms. */
export const scrubPositionFromX = (
  x: number,
  width: number,
  durationMs: number,
): number => {
  'worklet'
  if (width <= 0 || durationMs <= 0) return 0
  return Math.round(clamp01(x / width) * durationMs)
}
