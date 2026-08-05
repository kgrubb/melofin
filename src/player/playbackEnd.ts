/** Whether intentional playback reached the end of the current media. */
export const mediaReachedEnd = ({
  isPlayingIntent,
  mediaPlaying,
  currentTimeSec,
  durationSec,
}: {
  readonly isPlayingIntent: boolean
  readonly mediaPlaying: boolean
  readonly currentTimeSec: number
  readonly durationSec: number
}): boolean =>
  isPlayingIntent &&
  !mediaPlaying &&
  durationSec > 0 &&
  currentTimeSec >= durationSec - 0.35
