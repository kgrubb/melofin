import { AppState, Platform } from 'react-native'
import { PlaystateCommand } from '@jellyfin/sdk/lib/generated-client/models/playstate-command'
import { filterJellyfinSessions } from '@/src/cast/deviceAggregator'
import { castError } from '@/src/cast/errors'
import { JELLYFIN_POLL_MS, type CastDevice, type CastProvider, type CastStatus } from '@/src/cast/types'
import { msToTicks, ticksToMs } from '@/src/domain/jellyfin'
import { err, ok } from '@/src/domain/result'
import { remotePlayQueue } from '@/src/cast/snapshot'
import {
  jellyfinSessionId,
  listSessions,
  playOnSession,
  sendPlaystate,
} from '@/src/services/jellyfin/sessions'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'

const deviceListeners = new Set<(devices: readonly CastDevice[]) => void>()
const statusListeners = new Set<(status: CastStatus) => void>()

const state = {
  pollTimer: null as ReturnType<typeof setInterval> | null,
  activeSessionId: null as string | null,
  discovery: false,
}

const emitDevices = (devices: readonly CastDevice[]) => {
  deviceListeners.forEach((cb) => cb(devices))
}

const emitStatus = (status: CastStatus) => {
  statusListeners.forEach((cb) => cb(status))
}

/** One `/Sessions` fetch serves discovery and/or active remote status. */
const refreshSessions = async (): Promise<void> => {
  const needDevices = state.discovery
  const needStatus = Boolean(state.activeSessionId)
  if (!needDevices && !needStatus) return

  if (Platform.OS === 'web') {
    if (needDevices) emitDevices([])
    return
  }

  const { context, session } = useSessionStore.getState()
  if (!context || !session) {
    if (needDevices) emitDevices([])
    return
  }

  if (needStatus && AppState.currentState !== 'active' && !needDevices) return

  const listed = await listSessions(context)
  if (!listed.ok) {
    if (needDevices) emitDevices([])
    return
  }

  if (needDevices) {
    emitDevices(
      filterJellyfinSessions(listed.value, context.deviceId, session.userId),
    )
  }

  if (!needStatus || AppState.currentState !== 'active') return
  const match = listed.value.find((s) => s.Id === state.activeSessionId)
  if (!match) {
    emitStatus({ playing: false, positionMs: 0, buffering: false, ended: true })
    return
  }
  const remote = match as {
    PlayState?: { IsPaused?: boolean; PositionTicks?: number }
    NowPlayingItem?: { Id?: string | null }
  }
  const playState = remote.PlayState
  const itemId = remote.NowPlayingItem?.Id ?? undefined
  emitStatus({
    playing: !(playState?.IsPaused ?? true),
    positionMs: ticksToMs(playState?.PositionTicks ?? 0),
    buffering: false,
    ended: false,
    itemId: itemId || undefined,
  })
}

const ensurePoll = () => {
  if (state.pollTimer) return
  state.pollTimer = setInterval(() => {
    void refreshSessions()
    if (!state.discovery && !state.activeSessionId && state.pollTimer) {
      clearInterval(state.pollTimer)
      state.pollTimer = null
    }
  }, JELLYFIN_POLL_MS)
}

export const setJellyfinDiscovery = (enabled: boolean): void => {
  state.discovery = enabled
  if (enabled) {
    void refreshSessions()
    ensurePoll()
    return
  }
  emitDevices([])
}

export const jellyfinRemoteProvider: CastProvider = {
  subscribeDevices: (cb) => {
    deviceListeners.add(cb)
    cb([])
    return () => {
      deviceListeners.delete(cb)
    }
  },
  connect: async (device, snapshot) => {
    const sessionId = jellyfinSessionId(device.id)
    const { context } = useSessionStore.getState()
    if (!sessionId || !context) {
      return err(castError('unreachable', 'No Jellyfin session'))
    }
    const { itemIds, startIndex } = remotePlayQueue(
      snapshot,
      usePlayerStore.getState().shuffleOrder,
    )
    const played = await playOnSession(
      context,
      sessionId,
      itemIds,
      msToTicks(snapshot.positionMs),
      startIndex,
    )
    if (!played.ok) {
      return err(castError('unreachable', played.error.message, played.error.cause))
    }
    state.activeSessionId = sessionId
    ensurePoll()
    if (!snapshot.isPlaying) {
      await sendPlaystate(context, sessionId, PlaystateCommand.Pause)
    }
    return ok(undefined)
  },
  disconnect: async () => {
    const sessionId = state.activeSessionId
    state.activeSessionId = null
    const { context } = useSessionStore.getState()
    if (sessionId && context) {
      await sendPlaystate(context, sessionId, PlaystateCommand.Stop)
    }
    return ok(undefined)
  },
  seek: async (positionMs) => {
    const { context } = useSessionStore.getState()
    if (!state.activeSessionId || !context) return err(castError('unreachable', 'No session'))
    const result = await sendPlaystate(
      context,
      state.activeSessionId,
      PlaystateCommand.Seek,
      msToTicks(positionMs),
    )
    return result.ok ? ok(undefined) : err(castError('unreachable', result.error.message))
  },
  next: async () => {
    const { context } = useSessionStore.getState()
    if (!state.activeSessionId || !context) return err(castError('unreachable', 'No session'))
    const result = await sendPlaystate(context, state.activeSessionId, PlaystateCommand.NextTrack)
    return result.ok ? ok(undefined) : err(castError('unreachable', result.error.message))
  },
  previous: async () => {
    const { context } = useSessionStore.getState()
    if (!state.activeSessionId || !context) return err(castError('unreachable', 'No session'))
    const result = await sendPlaystate(
      context,
      state.activeSessionId,
      PlaystateCommand.PreviousTrack,
    )
    return result.ok ? ok(undefined) : err(castError('unreachable', result.error.message))
  },
  syncTo: async (snapshot) => {
    const sessionId = state.activeSessionId
    const { context } = useSessionStore.getState()
    if (!sessionId || !context) return err(castError('unreachable', 'No session'))
    const { itemIds, startIndex } = remotePlayQueue(
      snapshot,
      usePlayerStore.getState().shuffleOrder,
    )
    const played = await playOnSession(
      context,
      sessionId,
      itemIds,
      msToTicks(snapshot.positionMs),
      startIndex,
    )
    if (!played.ok) {
      return err(castError('unreachable', played.error.message, played.error.cause))
    }
    if (!snapshot.isPlaying) {
      await sendPlaystate(context, sessionId, PlaystateCommand.Pause)
    }
    return ok(undefined)
  },
  play: async () => {
    const { context } = useSessionStore.getState()
    if (!state.activeSessionId || !context) return err(castError('unreachable', 'No session'))
    const result = await sendPlaystate(context, state.activeSessionId, PlaystateCommand.Unpause)
    return result.ok ? ok(undefined) : err(castError('unreachable', result.error.message))
  },
  pause: async () => {
    const { context } = useSessionStore.getState()
    if (!state.activeSessionId || !context) return err(castError('unreachable', 'No session'))
    const result = await sendPlaystate(context, state.activeSessionId, PlaystateCommand.Pause)
    return result.ok ? ok(undefined) : err(castError('unreachable', result.error.message))
  },
  subscribeStatus: (cb) => {
    statusListeners.add(cb)
    return () => {
      statusListeners.delete(cb)
    }
  },
}
