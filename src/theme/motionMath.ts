import { motion } from '@/src/theme/tokens'

/** Clamp a 0–1 progress ratio. */
export const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, value))

/** Position as a fraction of duration. */
export const scrubRatio = (positionMs: number, durationMs: number): number =>
  durationMs > 0 ? clamp01(positionMs / durationMs) : 0

/** Map a touch X within a track width to a seek position in ms. */
export const scrubPositionFromX = (
  x: number,
  width: number,
  durationMs: number,
): number => {
  if (width <= 0 || durationMs <= 0) return 0
  return Math.round(clamp01(x / width) * durationMs)
}

/** Whether a downward pan should dismiss the Now Playing sheet. */
export const shouldDismissSheet = (
  translationY: number,
  velocityY: number,
): boolean =>
  translationY > motion.sheet.dismissDistance ||
  velocityY > motion.sheet.dismissVelocity

/** Backdrop opacity from sheet open progress and drag (0–0.55). */
export const sheetBackdropOpacity = (
  progress: number,
  dragY: number,
  height: number,
): number => {
  const dragFactor =
    height > 0 ? 1 - Math.min(dragY / height, 0.55) : 1
  return clamp01(progress) * dragFactor * 0.55
}
