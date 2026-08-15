import NetInfo from '@react-native-community/netinfo'
import { Platform } from 'react-native'
import { aggregateDevices, localDevice } from '@/src/cast/deviceAggregator'
import { useCastStore } from '@/src/cast/castStore'
import { castError, castErrorMessage, withCastCopy } from '@/src/cast/errors'
import { airplayProvider, subscribeAirPlayRoute } from '@/src/cast/providers/airplay'
import {
  chromecastProvider,
  isChromecastAvailable,
  setChromecastDiscovery,
} from '@/src/cast/providers/chromecast'
import {
  jellyfinRemoteProvider,
  setJellyfinDiscovery,
} from '@/src/cast/providers/jellyfinRemote'
import { localProvider } from '@/src/cast/providers/local'
import { isLocalAudible, shouldMelioScrobble } from '@/src/cast/scrobblePolicy'
import { localDeviceName, playbackSnapshot } from '@/src/cast/snapshot'
import {
  beginTransfer,
  completeTransfer,
  failTransfer,
  idleTransfer,
  isTransferTimedOut,
  localOutput,
  sessionLost,
  setAirPlayRoute,
} from '@/src/cast/transferMachine'
import type { CastDevice, CastProvider } from '@/src/cast/types'
import { DISCOVERY_TTL_MS, LOCAL_DEVICE_ID, TRANSFER_TIMEOUT_MS } from '@/src/cast/types'
import { logger } from '@/src/logging/logger'
import { nextIndex, playingIdentity, previousIndex, indexOfMediaIdInPlayOrder } from '@/src/domain/queue'
import { goNextWithAutoplay } from '@/src/player/autoplayContinuation'
import { newPlaySessionId } from '@/src/domain/playSessionId'
import {
  isLocalDeviceId,
  shouldBlockRemoteTransfer,
  shouldIgnoreDuplicateTransfer,
  shouldSyncRemotePlayback,
} from '@/src/cast/transferPlan'
import {
  setLocalOutputEnabled,
  setMelioScrobbleEnabled,
} from '@/src/player/outputPolicy'
import { queueReport, reportForCurrent, stopAnchoredScrobble } from '@/src/player/scrobbleBridge'
import { usePlayerStore } from '@/src/store/player'

const state = {
  started: false,
  discoveryTimer: null as ReturnType<typeof setTimeout> | null,
  transferTimer: null as ReturnType<typeof setTimeout> | null,
  unsubs: [] as (() => void)[],
  statusUnsub: null as (() => void) | null,
  activeProvider: localProvider as CastProvider,
  castDevices: [] as readonly CastDevice[],
  jellyDevices: [] as readonly CastDevice[],
  airplayDevices: [] as readonly CastDevice[],
  online: true,
  commandGen: 0,
  applyingRemote: false,
}

const providerFor = (device: CastDevice): CastProvider => {
  if (device.kind === 'chromecast') return chromecastProvider
  if (device.kind === 'jellyfin') return jellyfinRemoteProvider
  if (device.kind === 'airplay') return airplayProvider
  return localProvider
}

const publishDevices = () => {
  const cast = state.online && isChromecastAvailable() ? state.castDevices : []
  const jelly = state.online ? state.jellyDevices : []
  useCastStore.getState().setDevices(
    aggregateDevices(localDevice(localDeviceName()), [
      cast,
      jelly,
      state.airplayDevices,
    ]),
  )
}

const applyOutputPolicy = (kind: CastDevice['kind']) => {
  setLocalOutputEnabled(isLocalAudible(kind))
  setMelioScrobbleEnabled(shouldMelioScrobble(kind))
  useCastStore.getState().setVolumeSupported(kind === 'chromecast')
}

const clearTransferTimer = () => {
  if (!state.transferTimer) return
  clearTimeout(state.transferTimer)
  state.transferTimer = null
}

const bindStatus = (provider: CastProvider) => {
  state.statusUnsub?.()
  state.statusUnsub = provider.subscribeStatus((status) => {
    const store = usePlayerStore.getState()
    if (status.ended) {
      void handleSessionLost()
      return
    }
    if (!isLocalAudible(useCastStore.getState().transfer.active.kind)) {
      // Cast queue windows are finite — when a track ends near EOF while Melio
      // still wants playback, advance so syncTo loads the next window.
      const currentTrack = store.tracks[store.currentIndex]
      const sinkOnCurrent = status.queueEntryId
        ? status.queueEntryId === playingIdentity(currentTrack)
        : !status.itemId || status.itemId === currentTrack?.id
      const nearEnd =
        sinkOnCurrent &&
        Boolean(currentTrack) &&
        currentTrack!.durationMs > 0 &&
        status.positionMs >= Math.max(0, currentTrack!.durationMs - 2500)
      if (!status.playing && !status.buffering && store.isPlaying && nearEnd) {
        if (store.sleep.endOfTrack) {
          if (store.consumeEndOfTrackSleep()) {
            void state.activeProvider.pause()
          }
          return
        }
        if (nextIndex(store) >= 0) {
          store.goNext()
          return
        }
        // Single-flight inside goNextWithAutoplay — ignore repeat near-EOF polls.
        void goNextWithAutoplay()
        return
      }
      const prevIdx = previousIndex(
        store.repeat === 'one' ? { ...store, repeat: 'off' } : store,
      )
      const prevTrack = prevIdx >= 0 ? store.tracks[prevIdx] : undefined
      const laggingPrevious =
        !status.playing &&
        Boolean(prevTrack) &&
        prevIdx !== store.currentIndex &&
        (status.queueEntryId
          ? status.queueEntryId === playingIdentity(prevTrack)
          : Boolean(status.itemId && status.itemId === prevTrack?.id))
      if (laggingPrevious) return
      store.setPositionMs(status.positionMs)
      if (store.isPlaying !== status.playing) {
        store.setPlaying(status.playing)
      }
      const current = store.tracks[store.currentIndex]
      // Prefer queueEntryId; for media-id-only sinks (Jellyfin), stay put on same id
      // so duplicates don't snap to the first match.
      let index = -1
      if (status.queueEntryId) {
        if (status.queueEntryId !== playingIdentity(current)) {
          index = store.tracks.findIndex(
            (track) => playingIdentity(track) === status.queueEntryId,
          )
        }
      } else if (status.itemId && status.itemId !== current?.id) {
        index = indexOfMediaIdInPlayOrder(store, status.itemId)
      }
      if (index >= 0 && index !== store.currentIndex) {
        // Chromecast autoplay within the window can advance past end-of-track sleep.
        if (store.sleep.endOfTrack && nextIndex(store) === index) {
          if (store.consumeEndOfTrackSleep()) {
            void state.activeProvider.pause()
            const snapshot = playbackSnapshot()
            if (snapshot) {
              void state.activeProvider.syncTo({ ...snapshot, isPlaying: false })
            }
          }
          return
        }
        state.applyingRemote = true
        try {
          store.skipToIndex(index)
        } finally {
          state.applyingRemote = false
        }
      }
    }
  })
}

const handleSessionLost = async () => {
  clearTransferTimer()
  if (state.activeProvider !== localProvider) {
    await state.activeProvider.disconnect('session_lost')
  }
  state.activeProvider = localProvider
  applyOutputPolicy('local')
  useCastStore.getState().setTransfer(sessionLost(useCastStore.getState().transfer, localDeviceName()))
  usePlayerStore.getState().setPlaying(false)
  bindStatus(localProvider)
}

export const startDiscovery = (): void => {
  if (Platform.OS === 'web') return
  if (state.discoveryTimer) {
    clearTimeout(state.discoveryTimer)
    state.discoveryTimer = null
  }
  if (state.online) {
    setChromecastDiscovery(true)
    setJellyfinDiscovery(true)
  }
}

export const scheduleStopDiscovery = (): void => {
  if (state.discoveryTimer) clearTimeout(state.discoveryTimer)
  state.discoveryTimer = setTimeout(() => {
    setChromecastDiscovery(false)
    setJellyfinDiscovery(false)
    state.discoveryTimer = null
  }, DISCOVERY_TTL_MS)
}

export const transferTo = async (deviceId: string): Promise<void> => {
  if (Platform.OS === 'web') return
  const snapshot = playbackSnapshot()
  if (!snapshot && deviceId !== LOCAL_DEVICE_ID) {
    useCastStore.getState().setLastError(
      withCastCopy(castError('unsupported', 'Nothing playing')),
    )
    return
  }
  if (shouldBlockRemoteTransfer(state.online, deviceId)) {
    useCastStore.getState().setLastError(
      withCastCopy(castError('unreachable', castErrorMessage('unreachable'))),
    )
    return
  }

  const devices = useCastStore.getState().devices
  const device =
    devices.find((d) => d.id === deviceId) ??
    (isLocalDeviceId(deviceId) ? localDevice(localDeviceName()) : null)
  if (!device) {
    useCastStore.getState().setLastError(
      withCastCopy(castError('unreachable', 'Device not found')),
    )
    return
  }

  // AirPlay selection is system UI — just refresh route observation.
  if (device.kind === 'airplay') return

  const prior = useCastStore.getState().transfer
  const next = beginTransfer(prior, device.id, Date.now())
  if (shouldIgnoreDuplicateTransfer(prior, next)) return
  useCastStore.getState().setTransfer(next)
  clearTransferTimer()
  state.transferTimer = setTimeout(() => {
    const transfer = useCastStore.getState().transfer
    if (!isTransferTimedOut(transfer, Date.now(), TRANSFER_TIMEOUT_MS)) return
    void (async () => {
      await state.activeProvider.disconnect('timeout')
      state.activeProvider = localProvider
      applyOutputPolicy('local')
      useCastStore.getState().setTransfer(
        failTransfer(
          transfer,
          withCastCopy(castError('timeout', 'timeout')),
          localOutput(localDeviceName()),
        ),
      )
      usePlayerStore.getState().setPlaying(false)
      bindStatus(localProvider)
    })()
  }, TRANSFER_TIMEOUT_MS)

  const target = providerFor(device)
  if (state.activeProvider !== target && state.activeProvider !== localProvider) {
    await state.activeProvider.disconnect('switch')
  }

  if (device.kind === 'local') {
    await state.activeProvider.disconnect('local')
    state.activeProvider = localProvider
    if (snapshot) await localProvider.connect(device, snapshot)
    else {
      setLocalOutputEnabled(true)
      setMelioScrobbleEnabled(true)
    }
    applyOutputPolicy('local')
    clearTransferTimer()
    useCastStore.getState().setTransfer(
      completeTransfer(useCastStore.getState().transfer, {
        deviceId: LOCAL_DEVICE_ID,
        kind: 'local',
        name: localDeviceName(),
      }),
    )
    bindStatus(localProvider)
    return
  }

  if (!snapshot) {
    clearTransferTimer()
    useCastStore.getState().setTransfer(
      failTransfer(next, withCastCopy(castError('unsupported', 'Nothing playing'))),
    )
    return
  }

  const connected = await target.connect(device, snapshot)
  if (!connected.ok) {
    clearTransferTimer()
    state.activeProvider = localProvider
    applyOutputPolicy('local')
    useCastStore.getState().setTransfer(
      failTransfer(
        useCastStore.getState().transfer,
        withCastCopy(connected.error),
        localOutput(localDeviceName()),
      ),
    )
    usePlayerStore.getState().setPlaying(false)
    bindStatus(localProvider)
    return
  }

  state.activeProvider = target
  applyOutputPolicy(device.kind)
  clearTransferTimer()
  useCastStore.getState().setTransfer(
    completeTransfer(useCastStore.getState().transfer, {
      deviceId: device.id,
      kind: device.kind,
      name: device.name,
    }),
  )
  bindStatus(target)
  if (shouldMelioScrobble(device.kind) && snapshot.isPlaying) {
    void queueReport(async () => {
      await stopAnchoredScrobble()
      usePlayerStore.getState().setPlaySessionId(newPlaySessionId())
      await reportForCurrent('start')
    })
  }
}

export const seekActive = async (positionMs: number): Promise<void> => {
  const kind = useCastStore.getState().transfer.active.kind
  if (isLocalAudible(kind)) return
  await state.activeProvider.seek(positionMs)
}

export const setActiveVolume = async (volume: number): Promise<void> => {
  if (!state.activeProvider.setVolume) return
  const result = await state.activeProvider.setVolume(volume)
  if (result.ok) useCastStore.getState().setVolume(volume)
}

export const startCastRouter = (): void => {
  if (state.started || Platform.OS === 'web') return
  state.started = true
  useCastStore.getState().setTransfer(idleTransfer(localDeviceName()))
  applyOutputPolicy('local')
  publishDevices()

  state.unsubs.push(
    localProvider.subscribeDevices(() => publishDevices()),
    chromecastProvider.subscribeDevices((devices) => {
      state.castDevices = devices
      publishDevices()
    }),
    jellyfinRemoteProvider.subscribeDevices((devices) => {
      state.jellyDevices = devices
      publishDevices()
    }),
    airplayProvider.subscribeDevices((devices) => {
      state.airplayDevices = devices
      publishDevices()
    }),
    subscribeAirPlayRoute((routeName) => {
      const transfer = setAirPlayRoute(useCastStore.getState().transfer, routeName)
      useCastStore.getState().setTransfer(transfer)
      if (transfer.active.kind === 'airplay' || transfer.active.kind === 'local') {
        applyOutputPolicy(transfer.active.kind)
      }
    }),
  )

  void NetInfo.fetch().then((net) => {
    state.online = Boolean(net.isConnected && net.isInternetReachable !== false)
    publishDevices()
  })
  state.unsubs.push(
    NetInfo.addEventListener((net) => {
      state.online = Boolean(net.isConnected && net.isInternetReachable !== false)
      publishDevices()
    }),
  )

  // Forward transport while remote owns audio (absolute sync by playing identity).
  state.unsubs.push(
    usePlayerStore.subscribe((player, prev) => {
      if (
        player.isPlaying === prev.isPlaying &&
        player.currentIndex === prev.currentIndex &&
        player.tracks === prev.tracks &&
        player.shuffle === prev.shuffle &&
        player.shuffleOrder === prev.shuffleOrder &&
        player.repeat === prev.repeat
      ) {
        return
      }
      const kind = useCastStore.getState().transfer.active.kind
      const localAudible = isLocalAudible(kind)
      if (!localAudible && player.isPlaying !== prev.isPlaying) {
        void (player.isPlaying
          ? state.activeProvider.play()
          : state.activeProvider.pause())
      }
      const prevKey = playingIdentity(prev.tracks[prev.currentIndex])
      const nextKey = playingIdentity(player.tracks[player.currentIndex])
      const queueChanged =
        player.tracks !== prev.tracks ||
        player.shuffle !== prev.shuffle ||
        player.shuffleOrder !== prev.shuffleOrder ||
        player.repeat !== prev.repeat
      if (
        !shouldSyncRemotePlayback({
          applyingRemote: state.applyingRemote,
          localAudible,
          prevKey,
          nextKey,
          queueChanged,
        })
      ) {
        return
      }
      const provider = state.activeProvider
      const gen = ++state.commandGen
      void (async () => {
        const snapshot = playbackSnapshot()
        if (!snapshot || gen !== state.commandGen) return
        await provider.syncTo(snapshot)
      })()
    }),
  )

  bindStatus(localProvider)
  logger.info('cast.router_started')
}

export const stopCastRouter = (): void => {
  state.unsubs.forEach((u) => u())
  state.unsubs = []
  state.statusUnsub?.()
  state.statusUnsub = null
  clearTransferTimer()
  if (state.discoveryTimer) clearTimeout(state.discoveryTimer)
  state.discoveryTimer = null
  setChromecastDiscovery(false)
  setJellyfinDiscovery(false)
  state.commandGen += 1
  state.started = false
}
