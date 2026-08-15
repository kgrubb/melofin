import {
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio'
import { Platform } from 'react-native'
import { useCastStore } from '@/src/cast/castStore'
import { isLocalAudible } from '@/src/cast/scrobblePolicy'
import {
  PLAY_OUTPUT,
  REPLACE_LOAD_GRACE_MS,
  replaceLoadDecision,
  shouldPauseBeforeReplace,
  sourceIsLoaded,
} from '@/src/domain/audioSession'
import { touchEntry } from '@/src/domain/offline'
import {
  pickNormalizationGain,
  volumeFromGainDb,
} from '@/src/domain/replayGain'
import {
  AUDIO_START_CONFIRM_MS,
  excludeFailedUris,
  nextPlayableCachedIndex,
  prefetchCountForNetwork,
  shouldAbandonSilentStart,
  shouldAutoAdvanceOnLoadFailure,
  shouldFailoverStall,
} from '@/src/domain/playbackSource'
import { currentTrack, playingIdentity, prefetchTargets } from '@/src/domain/queue'
import { beginSeekGuard } from '@/src/domain/seekPosition'
import { logger } from '@/src/logging/logger'
import {
  downloadTrack,
  pauseOfflineDownloads,
  resumeOfflineDownloads,
} from '@/src/offline/downloader'
import {
  enqueue,
  hostOf,
  isLoopbackHost,
  stateRef,
  yieldMs,
} from '@/src/player/engineState'
import {
  isLocalOutputEnabled,
  setLocalOutputEnabled,
} from '@/src/player/outputPolicy'
import { resolveTrackSource } from '@/src/player/trackResolver'
import { bitrateForPreset, resolveStreamPreset } from '@/src/domain/streamQuality'
import { fetchItem } from '@/src/services/jellyfin/library'
import { melioRootUri, offlineAudioExists } from '@/src/storage/jsonFile'
import { maybeRefillAutoplay } from '@/src/player/autoplayContinuation'
import {
  applyNativeEq,
  clearNativeNextQueue,
  primeNextTrack,
} from '@/src/player/nativeQueue'
import { localHandoffPositionSec } from '@/src/player/crossfadeLocal'
import {
  getJellyfinReachable,
  markJellyfinReachable,
} from '@/src/services/jellyfin/reachabilityState'
import { getPlaybackNetworkCached } from '@/src/services/network'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

export const recoverLocalOutput = () => {
  const sink = useCastStore.getState().transfer.active.kind
  if (!isLocalOutputEnabled() && isLocalAudible(sink)) {
    setLocalOutputEnabled(true)
  }
}

const handoffSeekMs = (): number => {
  if (!stateRef.handoffActive) return 0
  const handoffSec = localHandoffPositionSec()
  if (handoffSec <= 0.05) return 0
  return Math.round(handoffSec * 1000)
}

const afterSuccessfulLoad = () => {
  if (stateRef.handoffActive) clearNativeNextQueue()
  applyNativeEq(useSettingsStore.getState().eq)
  maybeRefillAutoplay()
  void primeNextTrack()
}

const applyPlaybackVolume = (player: AudioPlayer) => {
  try {
    player.volume = stateRef.playbackVolume
    player.muted = PLAY_OUTPUT.muted
  } catch {
    // Native player may already be torn down.
  }
}

const snapshotStatus = (player: AudioPlayer): AudioStatus | null => {
  try {
    return player.currentStatus
  } catch {
    return null
  }
}

/**
 * After replace(), ignore the prior item's in-flight status. Do NOT wait for
 * duration. Jellyfin mp3 streams often leave duration at 0 for a long time.
 * Never treat `playing` as loaded (that is the previous track).
 */
const waitForLoaded = (
  player: AudioPlayer,
  epoch: number,
  timeoutMs = 2_500,
): Promise<boolean> =>
  new Promise((resolve) => {
    const startedAt = Date.now()
    const settled = { current: false }
    const finish = (ok: boolean) => {
      if (settled.current) return
      settled.current = true
      clearTimeout(timeout)
      clearInterval(poll)
      subscription.remove()
      resolve(ok)
    }

    if (epoch !== stateRef.loadEpoch) {
      finish(false)
      return
    }

    const consider = (status?: {
      readonly isLoaded?: boolean
      readonly playbackState?: string
    }) => {
      if (epoch !== stateRef.loadEpoch) {
        finish(false)
        return
      }
      const decision = replaceLoadDecision({
        elapsedMs: Date.now() - startedAt,
        graceMs: REPLACE_LOAD_GRACE_MS,
        isLoaded: Boolean(status?.isLoaded ?? sourceIsLoaded(player)),
        playbackState: status?.playbackState,
      })
      if (decision === 'failed') finish(false)
      if (decision === 'ready') finish(true)
    }

    const timeout = setTimeout(() => finish(false), timeoutMs)
    const poll = setInterval(() => {
      consider(snapshotStatus(player) ?? { isLoaded: sourceIsLoaded(player) })
    }, 50)
    const subscription = player.addListener(
      'playbackStatusUpdate',
      (status: AudioStatus) => {
        consider(status)
      },
    )
  })

export const safePlay = (player: AudioPlayer) => {
  recoverLocalOutput()
  if (!isLocalOutputEnabled()) return
  try {
    applyPlaybackVolume(player)
    player.play()
  } catch {
    // Web can throw mid-replace.
  }
}

const confirmAudibleStart = async (
  player: AudioPlayer,
  epoch: number,
  shouldPlay: boolean,
  seekMs: number,
  transportGen?: number,
): Promise<boolean> => {
  const wantsPlay = () =>
    shouldPlay &&
    epoch === stateRef.loadEpoch &&
    (transportGen === undefined || transportGen === stateRef.transportGen) &&
    usePlayerStore.getState().isPlaying &&
    isLocalOutputEnabled()

  if (!wantsPlay()) return true

  const startedAt = Date.now()
  while (Date.now() - startedAt < AUDIO_START_CONFIRM_MS) {
    if (epoch !== stateRef.loadEpoch) return false
    const status = snapshotStatus(player)
    const raw = (status?.currentTime ?? player.currentTime) * 1000
    const positionMs = Number.isFinite(raw) ? Math.round(raw) : 0
    const elapsedMs = Date.now() - startedAt
    if (
      shouldAbandonSilentStart({
        wantsPlay: true,
        elapsedMs,
        confirmWithinMs: AUDIO_START_CONFIRM_MS,
        positionMs,
        seekMs,
        isBuffering: Boolean(status?.isBuffering ?? player.isBuffering),
        playbackState: status?.playbackState,
      })
    ) {
      return false
    }
    if (seekMs < 80 && positionMs >= 80 && positionMs < 5_000) return true
    if (seekMs >= 80 && Math.abs(positionMs - seekMs) < 2_500) return true
    await yieldMs(80)
  }

  const status = snapshotStatus(player)
  const raw = (status?.currentTime ?? player.currentTime) * 1000
  const positionMs = Number.isFinite(raw) ? Math.round(raw) : 0
  return !shouldAbandonSilentStart({
    wantsPlay: true,
    elapsedMs: AUDIO_START_CONFIRM_MS,
    confirmWithinMs: AUDIO_START_CONFIRM_MS,
    positionMs,
    seekMs,
    isBuffering: Boolean(status?.isBuffering ?? player.isBuffering),
    playbackState: status?.playbackState,
  })
}

const tryLoadUri = async (
  player: AudioPlayer,
  uri: string,
  headers: Readonly<Record<string, string>> | undefined,
  epoch: number,
  shouldPlay: boolean,
  timeoutMs: number,
  seekMs = 0,
  transportGen?: number,
): Promise<boolean> => {
  stateRef.replacing = true
  try {
    if (epoch !== stateRef.loadEpoch) return false
    if (shouldPauseBeforeReplace(Platform.OS)) {
      try {
        player.pause()
      } catch {
        // Ignore.
      }
    }

    const source =
      headers && !uri.startsWith('file:')
        ? { uri, headers: { ...headers } }
        : { uri }
    try {
      player.replace(source)
    } catch (cause) {
      logger.warn('audio.replace_failed', {
        host: hostOf(uri),
        cause: String(cause),
      })
      return false
    }

    const loaded = await waitForLoaded(player, epoch, timeoutMs)
    if (!loaded || epoch !== stateRef.loadEpoch) {
      return false
    }

    // Gapless/crossfade: seek primary to secondary playhead before play.
    const seekBaseMs = Math.max(0, seekMs)
    const targetMs =
      stateRef.handoffActive
        ? Math.max(seekBaseMs, handoffSeekMs())
        : seekBaseMs
    if (targetMs > 0) {
      stateRef.seekGuard = beginSeekGuard(targetMs, Date.now())
      stateRef.lastPositionMs = targetMs
      usePlayerStore.getState().setPositionMs(targetMs)
    }

    applyPlaybackVolume(player)

    if (targetMs > 0) {
      try {
        await player.seekTo(targetMs / 1000)
      } catch {
        // Ignore. Seek guard will retry from the progress timer.
      }
      // Verify once. AVPlayer often ignores the first seek right after replace.
      await yieldMs(40)
      const landed = Math.round(player.currentTime * 1000)
      if (!Number.isFinite(landed) || Math.abs(landed - targetMs) > 1250) {
        try {
          await player.seekTo(targetMs / 1000)
        } catch {
          // Ignore.
        }
      }
    }

    const mayPlay = () =>
      shouldPlay &&
      epoch === stateRef.loadEpoch &&
      (transportGen === undefined || transportGen === stateRef.transportGen) &&
      usePlayerStore.getState().isPlaying &&
      isLocalOutputEnabled()

    if (mayPlay()) {
      safePlay(player)
      await yieldMs(40)
      if (mayPlay() && !player.playing) {
        safePlay(player)
      }
    }

    const audible = await confirmAudibleStart(
      player,
      epoch,
      shouldPlay,
      targetMs,
      transportGen,
    )
    if (!audible || epoch !== stateRef.loadEpoch) {
      return false
    }

    // Drop secondary once primary is confirmed audible.
    if (stateRef.handoffActive) clearNativeNextQueue()

    stateRef.loadedUri = uri
    return true
  } catch (cause) {
    logger.warn('audio.load_failed', {
      host: hostOf(uri),
      cause: String(cause),
    })
    return false
  } finally {
    stateRef.replacing = false
  }
}

export const handleLoadFailure = () => {
  if (stateRef.handoffActive) clearNativeNextQueue()
  const network = getPlaybackNetworkCached()
  const advance = shouldAutoAdvanceOnLoadFailure({
    network,
    jfReachable: getJellyfinReachable(),
    allRemotesTimedOut: stateRef.lastLoadAllRemotesFailed,
  })
  if (!advance) {
    usePlayerStore.getState().setPlaying(false)
    return
  }
  const queue = usePlayerStore.getState()
  const next = nextPlayableCachedIndex(
    queue,
    useSettingsStore.getState().offlineIndex,
    queue.currentIndex,
  )
  if (next < 0) {
    usePlayerStore.getState().setPlaying(false)
    return
  }
  usePlayerStore.getState().playAtIndex(next)
}

export const loadCurrent = async (
  player: AudioPlayer,
  opts?: {
    readonly play?: boolean
    readonly seekMs?: number
    readonly transportGen?: number
  },
): Promise<boolean> => {
  const shouldPlay = opts?.play ?? usePlayerStore.getState().isPlaying
  // Only seek when the caller asks (resume / stall failover). Defaulting to
  // store.positionMs races with stale progress polls after goNext and can seek
  // the next track into the prior item's EOF position.
  const explicitSeekMs = opts?.seekMs
  const replaceSeekMs = explicitSeekMs ?? 0
  const transportGen = opts?.transportGen
  stateRef.advancing = false
  stateRef.lastLoadAllRemotesFailed = false
  // Fresh track loads (no explicit seek) clear stall bookkeeping. Do NOT clear
  // when seekMs happens to be 0 on a stall failover. That looped replaces.
  if (explicitSeekMs === undefined) {
    stateRef.lastPositionMs = 0
    stateRef.stallFailoverDone = false
    stateRef.failedUris.clear()
    stateRef.forceReload = false
  }
  const queue = usePlayerStore.getState()
  const session = useSessionStore.getState()
  const settings = useSettingsStore.getState()
  const track = currentTrack(queue)
  if (!track || !session.session || !session.context) {
    logger.warn('audio.load_skipped', {
      reason: !track ? 'no_track' : !session.session ? 'no_session' : 'no_context',
    })
    return false
  }

  // Drop handoff if this load isn't the primed next track (e.g. manual skip).
  if (
    stateRef.handoffActive &&
    stateRef.handoffForKey !== playingIdentity(track)
  ) {
    clearNativeNextQueue()
  }

  const network = getPlaybackNetworkCached()
  const jfReachable = getJellyfinReachable()
  const streamPreset = resolveStreamPreset(settings.streamQuality, network)
  // Apply track gain immediately. Never block load on album metadata.
  stateRef.playbackVolume = volumeFromGainDb(
    pickNormalizationGain(
      settings.replayGainMode,
      track.normalizationGain,
      undefined,
    ),
  )
  if (settings.replayGainMode === 'album' && track.albumId) {
    const albumId = track.albumId
    const trackId = track.id
    void fetchItem(session.context, session.session.userId, albumId).then((album) => {
      if (!album.ok) return
      if (currentTrack(usePlayerStore.getState())?.id !== trackId) return
      const volume = volumeFromGainDb(
        pickNormalizationGain('album', track.normalizationGain, album.value.normalizationGain),
      )
      stateRef.playbackVolume = volume
      const player = stateRef.engine?.player
      if (player) {
        try {
          player.volume = volume
        } catch {
          // Ignore.
        }
      }
    })
  }
  const resolved = resolveTrackSource(
    track,
    settings.offlineIndex,
    session.context,
    session.session.userId,
    {
      network,
      jfReachable,
      platform: Platform.OS,
      melioRootUri: Platform.OS === 'web' ? undefined : melioRootUri(),
      // Prefer prefetch/user files only when the bytes are actually on disk.
      fileExists: Platform.OS === 'web' ? undefined : offlineAudioExists,
      maxBitrate: bitrateForPreset(streamPreset),
    },
  )
  if (!resolved) {
    logger.warn('audio.load_skipped', { reason: 'unresolved_source' })
    return false
  }

  if (
    Platform.OS !== 'web' &&
    !resolved.fromCache &&
    isLoopbackHost(resolved.uri)
  ) {
    logger.warn('audio.loopback_unreachable', {
      host: hostOf(resolved.uri),
      hint: 'Use your Jellyfin LAN IP (e.g. http://192.168.x.x:8096), not localhost',
    })
    return false
  }

  const playAllowed = () =>
    shouldPlay &&
    (transportGen === undefined || transportGen === stateRef.transportGen) &&
    usePlayerStore.getState().isPlaying &&
    isLocalOutputEnabled()

  // Handoff must replace/seek-match even when the next track shares a URI
  // (duplicate queue entries); otherwise we keep the finished primary item.
  if (
    !stateRef.handoffActive &&
    !stateRef.forceReload &&
    !stateRef.failedUris.has(resolved.uri) &&
    stateRef.loadedUri === resolved.uri &&
    sourceIsLoaded(player)
  ) {
    const currentMs = Math.round(player.currentTime * 1000)
    // Only seek when explicitly requested (resume / stall). Never seekTo(0) on
    // a bare same-URI short-circuit. That restarted songs after blips/resume.
    if (
      explicitSeekMs != null &&
      Number.isFinite(currentMs) &&
      Math.abs(currentMs - explicitSeekMs) > 500
    ) {
      stateRef.seekGuard = beginSeekGuard(explicitSeekMs, Date.now())
      stateRef.lastPositionMs = explicitSeekMs
      usePlayerStore.getState().setPositionMs(explicitSeekMs)
      try {
        await player.seekTo(explicitSeekMs / 1000)
      } catch {
        // Ignore.
      }
    }
    if (playAllowed()) safePlay(player)
    else applyPlaybackVolume(player)
    stateRef.playingFromCache = resolved.fromCache
    stateRef.lastMovingAt = Date.now()
    afterSuccessfulLoad()
    return true
  }

  pauseOfflineDownloads()
  try {
    const epoch = ++stateRef.loadEpoch
    const candidates = excludeFailedUris(
      [resolved.uri, ...(resolved.fallbackUris ?? [])],
      stateRef.failedUris,
    )
    const tallies = { remoteAttempts: 0, remoteFailures: 0 }
    stateRef.forceReload = false

    const loadNext = async (index: number): Promise<boolean> => {
      if (index >= candidates.length) {
        stateRef.lastLoadAllRemotesFailed =
          tallies.remoteAttempts > 0 &&
          tallies.remoteFailures === tallies.remoteAttempts
        return false
      }
      if (epoch !== stateRef.loadEpoch) return false
      const uri = candidates[index]!
      const isFile = uri.startsWith('file:')
      if (!isFile) tallies.remoteAttempts += 1
      const headers = isFile ? undefined : resolved.headers
      const timeoutMs = resolved.timeoutMsByUri[uri] ?? 2_500
      const active = stateRef.engine?.player ?? player
      const loaded = await tryLoadUri(
        active,
        uri,
        headers,
        epoch,
        shouldPlay,
        timeoutMs,
        replaceSeekMs,
        transportGen,
      )
      if (loaded) {
        stateRef.playingFromCache = isFile
        stateRef.lastMovingAt = Date.now()
        if (isFile) {
          const touched = touchEntry(
            useSettingsStore.getState().offlineIndex,
            track.id,
            Date.now(),
          )
          void useSettingsStore.getState().setOfflineIndex(touched)
        } else {
          markJellyfinReachable()
        }
        logger.info('audio.loaded', {
          host: hostOf(uri),
          trackId: track.id,
          fromFile: isFile,
        })
        if (Platform.OS !== 'web') {
          try {
            active.updateLockScreenMetadata({
              title: track.title,
              artist: track.artist,
              albumTitle: track.album,
              artworkUrl: track.artworkUrl,
              duration: track.durationMs > 0 ? track.durationMs / 1000 : undefined,
            })
          } catch {
            // Ignore when lock screen is inactive.
          }
        }
        afterSuccessfulLoad()
        return true
      }
      stateRef.failedUris.add(uri)
      if (!isFile) tallies.remoteFailures += 1
      return loadNext(index + 1)
    }

    return loadNext(0)
  } finally {
    resumeOfflineDownloads()
  }
}

export const maybePrefetch = async () => {
  if (Platform.OS === 'web') return
  const settings = useSettingsStore.getState()
  if (!settings.prefetchEnabled) return
  const session = useSessionStore.getState()
  if (!session.context || !session.session) return
  const network = getPlaybackNetworkCached()
  const count = prefetchCountForNetwork(network, getJellyfinReachable())
  if (count <= 0) return
  const targets = prefetchTargets(usePlayerStore.getState(), count)
  await Promise.all(
    targets.map((track) =>
      downloadTrack(
        session.context!,
        session.session!.userId,
        track,
        'prefetch',
      ),
    ),
  )
}

export const maybeStallFailover = (player: AudioPlayer) => {
  if (Platform.OS === 'web' || stateRef.stallFailoverDone || stateRef.replacing) {
    return
  }
  if (!isLocalOutputEnabled()) return
  const sink = useCastStore.getState().transfer.active.kind
  if (!isLocalAudible(sink)) return
  const queue = usePlayerStore.getState()
  if (
    !shouldFailoverStall({
      wantsPlay: queue.isPlaying,
      playingFromCache: stateRef.playingFromCache,
      now: Date.now(),
      lastMovingAt: stateRef.lastMovingAt,
    })
  ) {
    return
  }
  stateRef.stallFailoverDone = true
  if (stateRef.loadedUri) stateRef.failedUris.add(stateRef.loadedUri)
  stateRef.loadedUri = null
  stateRef.forceReload = true
  const seekMs = Math.max(
    stateRef.lastPositionMs,
    usePlayerStore.getState().positionMs,
  )
  logger.warn('audio.stall_failover', { seekMs, fromCache: stateRef.playingFromCache })
  void enqueue(async () => {
    const active = stateRef.engine?.player ?? player
    const loaded = await loadCurrent(active, { play: true, seekMs })
    if (!loaded) handleLoadFailure()
  })
}
