export type AudioSessionBridgeHandlers = {
  readonly isPlaying: () => boolean
  readonly pausedForRouteLoss: () => boolean
  readonly pauseForRouteLoss: () => void
  readonly resumeAfterRoute: () => void
}

export const startAudioSessionBridge = (
  _handlers: AudioSessionBridgeHandlers,
): (() => void) => () => undefined
