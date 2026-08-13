export type SleepTimerState = {
  readonly deadlineMs: number | null
  readonly endOfTrack: boolean
}

export const sleepOff = (): SleepTimerState => ({
  deadlineMs: null,
  endOfTrack: false,
})

export const sleepUntil = (deadlineMs: number): SleepTimerState => ({
  deadlineMs,
  endOfTrack: false,
})

export const sleepEndOfTrack = (): SleepTimerState => ({
  deadlineMs: null,
  endOfTrack: true,
})

export const remainingMs = (state: SleepTimerState, nowMs: number): number => {
  if (state.deadlineMs === null) return 0
  return Math.max(0, state.deadlineMs - nowMs)
}

export const shouldFireDeadline = (state: SleepTimerState, nowMs: number): boolean =>
  state.deadlineMs !== null && nowMs >= state.deadlineMs

export const isSleepArmed = (state: SleepTimerState): boolean =>
  state.deadlineMs !== null || state.endOfTrack

export const SLEEP_PRESETS_MINUTES = [5, 10, 15, 30, 45, 60] as const
