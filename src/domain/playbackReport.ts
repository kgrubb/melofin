export type PlaybackReportPhase = 'start' | 'progress' | 'stop'

export type PlaybackReportInput = {
  readonly itemId: string
  readonly mediaSourceId?: string
  readonly playSessionId: string
  readonly positionTicks: number
  readonly isPaused: boolean
  readonly canSeek: boolean
  readonly playMethod: 'DirectPlay' | 'Transcode'
}

export const buildPlaybackStartBody = (input: PlaybackReportInput) => ({
  ItemId: input.itemId,
  MediaSourceId: input.mediaSourceId,
  PlaySessionId: input.playSessionId,
  PositionTicks: input.positionTicks,
  IsPaused: input.isPaused,
  CanSeek: input.canSeek,
  PlayMethod: input.playMethod,
})

export const buildPlaybackProgressBody = (input: PlaybackReportInput) =>
  buildPlaybackStartBody(input)

export const buildPlaybackStopBody = (input: PlaybackReportInput) => ({
  ItemId: input.itemId,
  MediaSourceId: input.mediaSourceId,
  PlaySessionId: input.playSessionId,
  PositionTicks: input.positionTicks,
})

export const shouldFlushProgress = (
  lastSentAt: number,
  now: number,
  intervalMs = 10_000,
): boolean => now - lastSentAt >= intervalMs
