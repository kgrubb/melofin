const WIRED_PAUSE_PORTS = ['usb', 'car', 'headphones', 'lineout'] as const
const AUTO_RESUME_PORTS = ['usb', 'car'] as const

export type AudioSessionAction = 'none' | 'pause' | 'resume'

const normalizePort = (port: string): string => port.trim().toLowerCase()

const portsInclude = (
  ports: readonly string[],
  interesting: readonly string[],
): boolean =>
  ports.some((port) => interesting.some((item) => item === normalizePort(port)))

const lostPorts = (
  previous: readonly string[],
  current: readonly string[],
  interesting: readonly string[],
): boolean => portsInclude(previous, interesting) && !portsInclude(current, interesting)

const gainedPorts = (
  previous: readonly string[],
  current: readonly string[],
  interesting: readonly string[],
): boolean => !portsInclude(previous, interesting) && portsInclude(current, interesting)

/** Pause on wired unplug. Resume USB/car only if we paused for that loss. */
export const planAudioRouteAction = (input: {
  readonly reason: string
  readonly previousPorts: readonly string[]
  readonly currentPorts: readonly string[]
  readonly isPlaying: boolean
  readonly pausedForRouteLoss: boolean
}): AudioSessionAction => {
  if (lostPorts(input.previousPorts, input.currentPorts, WIRED_PAUSE_PORTS)) {
    return input.isPlaying || input.pausedForRouteLoss ? 'pause' : 'none'
  }
  if (
    input.pausedForRouteLoss &&
    gainedPorts(input.previousPorts, input.currentPorts, AUTO_RESUME_PORTS)
  ) {
    return 'resume'
  }
  if (input.reason.toLowerCase() === 'olddeviceunavailable' && input.isPlaying) {
    return 'pause'
  }
  return 'none'
}

/** Pause on interrupt. Resume with shouldResume, or USB/car attach without it. */
export const planAudioInterruptAction = (input: {
  readonly type: 'began' | 'ended'
  readonly shouldResume: boolean
  readonly currentPorts: readonly string[]
  readonly isPlaying: boolean
  readonly pausedForRouteLoss: boolean
}): AudioSessionAction => {
  if (input.type === 'began') return input.isPlaying ? 'pause' : 'none'
  if (!input.pausedForRouteLoss) return 'none'
  if (input.shouldResume) return 'resume'
  return portsInclude(input.currentPorts, AUTO_RESUME_PORTS) ? 'resume' : 'none'
}
