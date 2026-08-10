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

/** Store/engine transition used to decide Jellyfin playstate reports. */
export type TransportTransition = {
  readonly wasPlaying: boolean
  readonly isPlaying: boolean
  readonly trackChanged: boolean
  /** True when a PlaySessionId already exists for the current listen. */
  readonly hasPlaySession: boolean
}

export type TransportPlan = {
  readonly kind: 'idle' | 'pause' | 'resume' | 'start' | 'load'
  readonly mintSession: boolean
  readonly reportStart: boolean
  readonly reportProgress: boolean
  readonly play: boolean
  readonly pause: boolean
}

const idle = {
  kind: 'idle',
  mintSession: false,
  reportStart: false,
  reportProgress: false,
  play: false,
  pause: false,
} as const satisfies TransportPlan

/**
 * Pause/resume must keep the same PlaySessionId and use Progress (IsPaused).
 * Minting a new session + PlaybackStart on unpause breaks Jellyfin scrobbling.
 */
export const planTransport = (t: TransportTransition): TransportPlan => {
  const started = t.isPlaying && !t.wasPlaying
  const paused = !t.isPlaying && t.wasPlaying

  if (paused) {
    return {
      kind: 'pause',
      mintSession: false,
      reportStart: false,
      reportProgress: true,
      play: false,
      pause: true,
    }
  }

  if (started && !t.trackChanged && t.hasPlaySession) {
    return {
      kind: 'resume',
      mintSession: false,
      reportStart: false,
      reportProgress: true,
      play: true,
      pause: false,
    }
  }

  if (t.isPlaying && (started || t.trackChanged)) {
    return {
      kind: 'start',
      mintSession: true,
      reportStart: true,
      reportProgress: false,
      play: true,
      pause: false,
    }
  }

  if (t.trackChanged) {
    return {
      kind: 'load',
      mintSession: false,
      reportStart: false,
      reportProgress: false,
      play: false,
      pause: false,
    }
  }

  return idle
}
