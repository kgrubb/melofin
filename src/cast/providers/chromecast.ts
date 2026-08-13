import { Platform } from 'react-native'
import { castableUrl } from '@/src/cast/castUrl'
import { castError } from '@/src/cast/errors'
import type {
  CastDevice,
  CastProvider,
  CastStatus,
  PlaybackSnapshot,
} from '@/src/cast/types'
import type { QueueTrack } from '@/src/domain/queue'
import { err, ok } from '@/src/domain/result'
import { resolveTrackSource } from '@/src/player/trackResolver'
import { bitrateForPreset, resolveStreamPreset } from '@/src/domain/streamQuality'
import { getPlaybackNetworkCached } from '@/src/services/network'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { logger } from '@/src/logging/logger'
import { melioRootUri } from '@/src/storage/jsonFile'

type CastSdk = typeof import('react-native-google-cast')

const deviceListeners = new Set<(devices: readonly CastDevice[]) => void>()
const statusListeners = new Set<(status: CastStatus) => void>()

const state = {
  sdk: null as CastSdk | null,
  discoverySub: null as { remove: () => void } | null,
  mediaSub: null as { remove: () => void } | null,
  sessionEndedSub: null as { remove: () => void } | null,
  available: Platform.OS !== 'web',
}

const loadSdk = (): CastSdk | null => {
  if (Platform.OS === 'web') return null
  if (state.sdk) return state.sdk
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    state.sdk = require('react-native-google-cast') as CastSdk
    return state.sdk
  } catch (cause) {
    state.available = false
    logger.warn('cast.sdk_unavailable', { cause })
    return null
  }
}

const castContext = (mod: CastSdk) => {
  const ctx = mod.CastContext
  if (!ctx) {
    state.available = false
    return null
  }
  return ctx
}

const emitDevices = (devices: readonly CastDevice[]) => {
  deviceListeners.forEach((cb) => cb(devices))
}

const emitStatus = (status: CastStatus) => {
  statusListeners.forEach((cb) => cb(status))
}

const toCastDevice = (device: {
  deviceId: string
  friendlyName: string
}): CastDevice => ({
  id: `cast:${device.deviceId}`,
  name: device.friendlyName,
  kind: 'chromecast',
  subtitle: 'Chromecast',
})

const resolveStream = (track: QueueTrack) => {
  const session = useSessionStore.getState()
  const settings = useSettingsStore.getState()
  if (!session.session) return null
  const network = getPlaybackNetworkCached()
  return resolveTrackSource(
    track,
    settings.offlineIndex,
    session.context,
    session.session.userId,
    {
      network,
      platform: Platform.OS,
      melioRootUri: Platform.OS === 'web' ? undefined : melioRootUri(),
      maxBitrate: bitrateForPreset(
        resolveStreamPreset(settings.streamQuality, network),
      ),
    },
  )
}

const mediaInfoFor = async (track: QueueTrack) => {
  const resolved = resolveStream(track)
  if (!resolved) return err(castError('unreachable', 'No stream'))
  const primary = castableUrl(resolved.uri)
  const build = (contentUrl: string) =>
    ({
      contentUrl,
      contentType: 'audio/mpeg',
      streamType: 'buffered',
      metadata: {
        type: 'musicTrack' as const,
        title: track.title,
        artist: track.artist,
        albumTitle: track.album,
        images: track.artworkUrl ? [{ url: track.artworkUrl }] : undefined,
      },
      customData: {
        itemId: track.id,
        queueEntryId: track.queueEntryId,
      },
    }) as import('react-native-google-cast').MediaInfo

  if (primary.ok) return ok(build(primary.value))
  const fallback = (resolved.fallbackUris ?? [])
    .map((uri) => castableUrl(uri))
    .find((r) => r.ok)
  if (!fallback || !fallback.ok) return err(primary.error)
  return ok(build(fallback.value))
}

const queueItems = async (snapshot: PlaybackSnapshot) => {
  const { shuffle, shuffleOrder } = usePlayerStore.getState()
  const indices =
    shuffle && shuffleOrder.length === snapshot.queue.length
      ? (() => {
          const pos = shuffleOrder.indexOf(snapshot.currentIndex)
          const from = pos >= 0 ? pos : 0
          return shuffleOrder.slice(from, from + 20)
        })()
      : Array.from(
          {
            length: Math.min(
              20,
              Math.max(0, snapshot.queue.length - snapshot.currentIndex),
            ),
          },
          (_, i) => snapshot.currentIndex + i,
        )
  const window = indices
    .map((i) => snapshot.queue[i])
    .filter((track): track is QueueTrack => track != null)
  const built = await Promise.all(
    window.map(async (track, index) => {
      const info = await mediaInfoFor(track)
      if (!info.ok) return null
      return {
        mediaInfo: info.value,
        autoplay: true,
        preloadTime: 10,
        startTime: index === 0 ? snapshot.positionMs / 1000 : 0,
      }
    }),
  )
  return built.filter((item): item is NonNullable<typeof item> => item != null)
}

/** Never Cast ALL — window is ≤20; Melio owns full-queue wrap via syncTo. */
const castRepeatMode = (mod: CastSdk, repeat: PlaybackSnapshot['repeat']) => {
  const modes = mod.MediaRepeatMode
  if (!modes) return undefined
  return repeat === 'one' ? modes.SINGLE : modes.OFF
}

const client = async () => {
  const mod = loadSdk()
  if (!mod) return null
  const ctx = castContext(mod)
  if (!ctx) return null
  try {
    const session = await ctx.getSessionManager().getCurrentCastSession()
    return session?.client ?? null
  } catch {
    return null
  }
}

export const isChromecastAvailable = (): boolean => {
  if (!state.available || Platform.OS === 'web') return false
  const mod = loadSdk()
  return mod != null && castContext(mod) != null
}

export const setChromecastDiscovery = (enabled: boolean): void => {
  const mod = loadSdk()
  const ctx = mod ? castContext(mod) : null
  if (!mod || !ctx) {
    emitDevices([])
    return
  }
  // Touch CastContext so the native framework is initialized.
  void ctx.getCastState().catch(() => undefined)
  const discovery = ctx.getDiscoveryManager()
  if (!enabled) {
    state.discoverySub?.remove()
    state.discoverySub = null
    void discovery.stopDiscovery?.().catch(() => undefined)
    emitDevices([])
    return
  }
  void discovery.startDiscovery().catch((cause) => {
    logger.warn('cast.discovery_start_failed', { cause })
  })
  void discovery.getDevices().then((devices) => {
    emitDevices(devices.map(toCastDevice))
  }).catch((cause) => {
    logger.warn('cast.discovery_list_failed', { cause })
  })
  state.discoverySub?.remove()
  state.discoverySub = discovery.onDevicesUpdated((devices) => {
    emitDevices(devices.map(toCastDevice))
  })
}

export const chromecastProvider: CastProvider = {
  subscribeDevices: (cb) => {
    deviceListeners.add(cb)
    cb([])
    return () => {
      deviceListeners.delete(cb)
    }
  },
  connect: async (device, snapshot) => {
    const mod = loadSdk()
    const ctx = mod ? castContext(mod) : null
    if (!mod || !ctx) return err(castError('unsupported', 'Cast unavailable'))
    const rawId = device.id.startsWith('cast:') ? device.id.slice(5) : device.id
    try {
      await ctx.getSessionManager().startSession(rawId)
      const remote = await client()
      if (!remote) return err(castError('unreachable', 'No Cast session'))
      const items = await queueItems(snapshot)
      if (items.length === 0) {
        return err(castError('offline_track', 'No castable tracks'))
      }
      await remote.loadMedia({
        autoplay: snapshot.isPlaying,
        mediaInfo: items[0]!.mediaInfo,
        startTime: snapshot.positionMs / 1000,
        queueData: {
          items,
          startIndex: 0,
          repeatMode: castRepeatMode(mod, snapshot.repeat),
        },
      })
      state.mediaSub?.remove()
      state.mediaSub = remote.onMediaStatusUpdated((status) => {
        if (!status) return
        const playing =
          status.playerState === 'playing' || status.playerState === 'buffering'
        const buffering = status.playerState === 'buffering'
        const custom = (status.mediaInfo as { customData?: { itemId?: string; queueEntryId?: string } } | undefined)
          ?.customData
        emitStatus({
          playing,
          positionMs: Math.round((status.streamPosition ?? 0) * 1000),
          buffering,
          ended: false,
          itemId: custom?.itemId,
          queueEntryId: custom?.queueEntryId,
        })
      })
      state.sessionEndedSub?.remove()
      state.sessionEndedSub = ctx.getSessionManager().onSessionEnded(() => {
        emitStatus({
          playing: false,
          positionMs: 0,
          buffering: false,
          ended: true,
        })
      })
      return ok(undefined)
    } catch (cause) {
      logger.warn('cast.connect_failed', { cause })
      return err(castError('unreachable', 'Cast connect failed', cause))
    }
  },
  disconnect: async () => {
    const mod = loadSdk()
    state.mediaSub?.remove()
    state.mediaSub = null
    state.sessionEndedSub?.remove()
    state.sessionEndedSub = null
    const ctx = mod ? castContext(mod) : null
    if (!ctx) return ok(undefined)
    try {
      await ctx.getSessionManager().endCurrentSession(true)
    } catch (cause) {
      logger.warn('cast.disconnect_failed', { cause })
    }
    return ok(undefined)
  },
  play: async () => {
    const remote = await client()
    if (!remote) return err(castError('unreachable', 'No Cast session'))
    await remote.play()
    return ok(undefined)
  },
  pause: async () => {
    const remote = await client()
    if (!remote) return err(castError('unreachable', 'No Cast session'))
    await remote.pause()
    return ok(undefined)
  },
  seek: async (positionMs) => {
    const remote = await client()
    if (!remote) return err(castError('unreachable', 'No Cast session'))
    await remote.seek({ position: positionMs / 1000 })
    return ok(undefined)
  },
  next: async () => {
    const remote = await client()
    if (!remote) return err(castError('unreachable', 'No Cast session'))
    await remote.queueNext()
    return ok(undefined)
  },
  previous: async () => {
    const remote = await client()
    if (!remote) return err(castError('unreachable', 'No Cast session'))
    await remote.queuePrev()
    return ok(undefined)
  },
  syncTo: async (snapshot) => {
    const mod = loadSdk()
    if (!mod) return err(castError('unsupported', 'Cast unavailable'))
    const remote = await client()
    if (!remote) return err(castError('unreachable', 'No Cast session'))
    const items = await queueItems(snapshot)
    if (items.length === 0) {
      return err(castError('offline_track', 'No castable tracks'))
    }
    try {
      await remote.loadMedia({
        autoplay: snapshot.isPlaying,
        mediaInfo: items[0]!.mediaInfo,
        startTime: snapshot.positionMs / 1000,
        queueData: {
          items,
          startIndex: 0,
          repeatMode: castRepeatMode(mod, snapshot.repeat),
        },
      })
      return ok(undefined)
    } catch (cause) {
      logger.warn('cast.sync_failed', { cause })
      return err(castError('unreachable', 'Cast sync failed', cause))
    }
  },
  setVolume: async (volume) => {
    const mod = loadSdk()
    const ctx = mod ? castContext(mod) : null
    if (!ctx) return err(castError('unsupported', 'Cast unavailable'))
    try {
      const session = await ctx.getSessionManager().getCurrentCastSession()
      if (!session) return err(castError('unreachable', 'No Cast session'))
      await session.setVolume(volume)
      return ok(undefined)
    } catch (cause) {
      return err(castError('unreachable', 'Cast volume failed', cause))
    }
  },
  getVolume: async () => {
    const mod = loadSdk()
    const ctx = mod ? castContext(mod) : null
    if (!ctx) return err(castError('unsupported', 'Cast unavailable'))
    try {
      const session = await ctx.getSessionManager().getCurrentCastSession()
      if (!session) return err(castError('unreachable', 'No Cast session'))
      const volume = await session.getVolume()
      return ok(volume)
    } catch (cause) {
      return err(castError('unreachable', 'Cast volume failed', cause))
    }
  },
  subscribeStatus: (cb) => {
    statusListeners.add(cb)
    return () => {
      statusListeners.delete(cb)
    }
  },
}
