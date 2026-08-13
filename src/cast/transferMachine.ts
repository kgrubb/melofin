import type { ActiveOutput, CastError, TransferPhase } from '@/src/cast/types'
import { LOCAL_DEVICE_ID } from '@/src/cast/types'

export type TransferState = {
  readonly phase: TransferPhase
  readonly active: ActiveOutput
  readonly previous: ActiveOutput | null
  readonly targetId: string | null
  readonly error: CastError | null
  readonly startedAt: number | null
}

export const localOutput = (name = 'This Phone'): ActiveOutput => ({
  deviceId: LOCAL_DEVICE_ID,
  kind: 'local',
  name,
})

export const idleTransfer = (name?: string): TransferState => ({
  phase: 'idle',
  active: localOutput(name),
  previous: null,
  targetId: null,
  error: null,
  startedAt: null,
})

export const beginTransfer = (
  state: TransferState,
  targetId: string,
  now: number,
): TransferState => {
  if (state.phase === 'transferring') return state
  if (targetId === state.active.deviceId && state.phase === 'connected') {
    return state
  }
  if (targetId === LOCAL_DEVICE_ID && state.active.kind === 'local') {
    return { ...state, phase: 'idle', error: null, targetId: null, startedAt: null }
  }
  return {
    phase: 'transferring',
    active: state.active,
    previous: state.active,
    targetId,
    error: null,
    startedAt: now,
  }
}

export const completeTransfer = (
  state: TransferState,
  active: ActiveOutput,
): TransferState => ({
  phase: active.kind === 'local' ? 'idle' : 'connected',
  active,
  previous: null,
  targetId: null,
  error: null,
  startedAt: null,
})

export const failTransfer = (
  state: TransferState,
  error: CastError,
  fallback: ActiveOutput = state.previous ?? localOutput(),
): TransferState => ({
  phase: 'failed',
  active: fallback,
  previous: null,
  targetId: null,
  error,
  startedAt: null,
})

export const cancelTransfer = (state: TransferState): TransferState => {
  if (state.phase !== 'transferring') return state
  return {
    phase: state.previous?.kind === 'local' || !state.previous ? 'idle' : 'connected',
    active: state.previous ?? localOutput(),
    previous: null,
    targetId: null,
    error: null,
    startedAt: null,
  }
}

export const sessionLost = (
  state: TransferState,
  localName?: string,
): TransferState => ({
  phase: 'idle',
  active: localOutput(localName),
  previous: null,
  targetId: null,
  error: null,
  startedAt: null,
})

export const isTransferTimedOut = (
  state: TransferState,
  now: number,
  timeoutMs: number,
): boolean =>
  state.phase === 'transferring' &&
  state.startedAt != null &&
  now - state.startedAt >= timeoutMs

export const setAirPlayRoute = (
  state: TransferState,
  routeName: string | null,
): TransferState => {
  if (state.phase === 'transferring') return state
  if (state.active.kind === 'chromecast' || state.active.kind === 'jellyfin') {
    return state
  }
  if (!routeName) {
    return {
      ...state,
      phase: 'idle',
      active: localOutput(),
      error: null,
    }
  }
  return {
    ...state,
    phase: 'connected',
    active: { deviceId: 'airplay', kind: 'airplay', name: routeName },
    error: null,
  }
}