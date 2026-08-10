import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio'
import { AppState, Platform } from 'react-native'
import {
  KEEP_AUDIO_SESSION_ACTIVE,
  PLAY_OUTPUT,
  shouldPauseBeforeReplace,
} from '@/src/domain/audioSession'
import { msToTicks } from '@/src/domain/jellyfin'
import {
  planTransport,
  shouldFlushProgress,
  type TransportPlan,
} from '@/src/domain/playbackReport'
import { newPlaySessionId } from '@/src/domain/playSessionId'
import { currentTrack, prefetchTargets } from '@/src/domain/queue'
import { logger } from '@/src/logging/logger'
import { downloadTrack } from '@/src/offline/downloader'
import { mediaReachedEnd } from '@/src/player/playbackEnd'
import { resolveTrackSource } from '@/src/player/trackResolver'
import {
  acceptReportedPosition,
  beginSeekGuard,
  idleSeekGuard,
  type SeekGuard,
} from '@/src/domain/seekPosition'
import {
  postCapabilities,
  reportProgress,
  reportStart,
  reportStop,
} from '@/src/services/jellyfin/playbackReport'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

type Engine = {
  readonly player: AudioPlayer
  readonly dispose: () => void
}

type ScrobbleAnchor = {
  readonly itemId: string
  readonly mediaSourceId?: string
  readonly playSessionId: string
  readonly playMethod: 'DirectPlay' | 'Transcode'
}

const GLOBAL_ENGINE_KEY = '__melioPlaybackEngine'

type GlobalEngineSlot = {
  readonly dispose: () => void
}

const getGlobalSlot = (): GlobalEngineSlot | null => {
  const slot = (globalThis as Record<string, unknown>)[GLOBAL_ENGINE_KEY]
  if (!slot || typeof slot !== 'object') return null
  if (!('dispose' in slot) || typeof (slot as GlobalEngineSlot).dispose !== 'function') {
    return null
  }
  return slot as GlobalEngineSlot
}

const setGlobalSlot = (slot: GlobalEngineSlot | null) => {
  if (slot) {
    ;(globalThis as Record<string, unknown>)[GLOBAL_ENGINE_KEY] = slot
    return
  }
  delete (globalThis as Record<string, unknown>)[GLOBAL_ENGINE_KEY]
}

const stateRef: {
  engine: Engine | null
  startPromise: Promise<Engine> | null
  lastProgressAt: number
  loadedUri: string | null
  loadEpoch: number
  /** Bumped on pause / superseding play so in-flight play never wins a race. */
  transportGen: number
  queue: Promise<void>
  /** Serializes Jellyfin playstate so Progress never races ahead of Start. */
  reportQueue: Promise<void>
  advancing: boolean
  scrobble: ScrobbleAnchor | null
  lastPositionMs: number
  seekGuard: SeekGuard
} = {
  engine: null,
  startPromise: null,
  lastProgressAt: 0,
  loadedUri: null,
  loadEpoch: 0,
  transportGen: 0,
  queue: Promise.resolve(),
  reportQueue: Promise.resolve(),
  advancing: false,
  scrobble: null,
  lastPositionMs: 0,
  seekGuard: idleSeekGuard(),
}

const enqueue = (task: () => Promise<void>) => {
  stateRef.queue = stateRef.queue.then(task, task).then(
    () => undefined,
    () => undefined,
  )
  return stateRef.queue
}

const enqueueReport = (task: () => Promise<unknown>) => {
  stateRef.reportQueue = stateRef.reportQueue.then(task, task).then(
    () => undefined,
    () => undefined,
  )
  return stateRef.reportQueue
}

const hostOf = (uri: string): string => {
  try {
    return new URL(uri).host || 'unknown'
  } catch {
    return 'invalid'
  }
}

const isLoopbackHost = (uri: string): boolean => {
  try {
    const host = new URL(uri).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

const sourceLooksReady = (player: AudioPlayer, status?: AudioStatus): boolean => {
  if (status) {
    if (status.isLoaded || status.duration > 0 || status.playing) return true
    if (status.currentTime > 0.05) return true
  }
  return (
    player.isLoaded ||
    player.duration > 0 ||
    player.playing ||
    player.currentTime > 0.05
  )
}

const waitForLoaded = (
  player: AudioPlayer,
  epoch: number,
  timeoutMs = 10_000,
): Promise<boolean> =>
  new Promise((resolve) => {
    if (sourceLooksReady(player)) {
      resolve(true)
      return
    }

    const settled = { current: false }
    const finish = (ok: boolean) => {
      if (settled.current) return
      settled.current = true
      clearTimeout(timeout)
      clearInterval(poll)
      subscription.remove()
      resolve(ok)
    }

    const timeout = setTimeout(() => finish(sourceLooksReady(player)), timeoutMs)
    const poll = setInterval(() => {
      if (epoch !== stateRef.loadEpoch) {
        finish(false)
        return
      }
      if (sourceLooksReady(player)) finish(true)
    }, 200)
    const subscription = player.addListener(
      'playbackStatusUpdate',
      (status: AudioStatus) => {
        if (epoch !== stateRef.loadEpoch) {
          finish(false)
          return
        }
        if (sourceLooksReady(player, status)) finish(true)
      },
    )
  })

const safePlay = (player: AudioPlayer) => {
  try {
    player.volume = PLAY_OUTPUT.volume
    player.muted = PLAY_OUTPUT.muted
    player.play()
  } catch {
    // Web HTMLMediaElement can throw synchronously if the element is mid-replace.
  }
}

const tryLoadUri = async (
  player: AudioPlayer,
  uri: string,
  epoch: number,
): Promise<boolean> => {
  stateRef.loadedUri = uri
  if (shouldPauseBeforeReplace(Platform.OS) && player.playing) {
    player.pause()
  }
  try {
    player.replace({ uri })
  } catch (cause) {
    logger.warn('audio.replace_failed', {
      host: hostOf(uri),
      cause: String(cause),
    })
    stateRef.loadedUri = null
    return false
  }
  safePlay(player)
  const loaded = await waitForLoaded(player, epoch)
  if (!loaded) {
    logger.warn('audio.load_timeout', { host: hostOf(uri) })
    stateRef.loadedUri = null
  }
  return loaded
}

const loadCurrent = async (player: AudioPlayer): Promise<boolean> => {
  stateRef.advancing = false
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
  const resolved = resolveTrackSource(
    track,
    settings.offlineIndex,
    session.context,
    session.session.userId,
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

  if (stateRef.loadedUri === resolved.uri && sourceLooksReady(player)) {
    return true
  }

  const epoch = ++stateRef.loadEpoch
  const uris = resolved.fromCache
    ? [resolved.uri]
    : [resolved.uri, ...(resolved.fallbackUris ?? [])]

  const loadNext = async (index: number): Promise<boolean> => {
    if (index >= uris.length) return false
    if (epoch !== stateRef.loadEpoch) return false
    const loaded = await tryLoadUri(player, uris[index]!, epoch)
    if (loaded) return true
    return loadNext(index + 1)
  }
  return loadNext(0)
}

const reportForCurrent = async (phase: 'start' | 'progress' | 'stop') => {
  const queue = usePlayerStore.getState()
  const session = useSessionStore.getState()
  const settings = useSettingsStore.getState()
  const track = currentTrack(queue)
  if (!track || !session.context || !session.session || !queue.playSessionId) return

  const resolved = resolveTrackSource(
    track,
    settings.offlineIndex,
    session.context,
    session.session.userId,
  )
  const payload = {
    itemId: track.id,
    mediaSourceId: track.mediaSourceId,
    playSessionId: queue.playSessionId,
    positionTicks: msToTicks(queue.positionMs),
    isPaused: !queue.isPlaying,
    canSeek: true,
    playMethod: resolved?.playMethod ?? 'DirectPlay',
  }

  if (phase === 'start') {
    await reportStart(session.context, payload)
    stateRef.scrobble = {
      itemId: track.id,
      mediaSourceId: track.mediaSourceId,
      playSessionId: queue.playSessionId,
      playMethod: payload.playMethod,
    }
    return
  }
  if (phase === 'progress') {
    await reportProgress(session.context, payload)
    return
  }
  await reportStop(session.context, payload)
  stateRef.scrobble = null
}

const stopAnchoredScrobble = async () => {
  const anchor = stateRef.scrobble
  const session = useSessionStore.getState()
  if (!anchor || !session.context) return
  await reportStop(session.context, {
    itemId: anchor.itemId,
    mediaSourceId: anchor.mediaSourceId,
    playSessionId: anchor.playSessionId,
    positionTicks: msToTicks(stateRef.lastPositionMs),
    isPaused: true,
    canSeek: true,
    playMethod: anchor.playMethod,
  })
  stateRef.scrobble = null
}

const maybePrefetch = async () => {
  if (Platform.OS === 'web') return
  const settings = useSettingsStore.getState()
  if (!settings.prefetchEnabled) return
  const session = useSessionStore.getState()
  if (!session.context || !session.session) return
  const targets = prefetchTargets(usePlayerStore.getState(), 2)
  await Promise.all(
    targets.map(async (track) => {
      const result = await downloadTrack(
        session.context!,
        session.session!.userId,
        track,
        'prefetch',
      )
      if (result.ok) {
        await useSettingsStore.getState().setOfflineIndex(result.value)
      }
    }),
  )
}

const advanceFromEnd = (player: AudioPlayer) => {
  if (stateRef.advancing) return
  if (!usePlayerStore.getState().isPlaying) return
  stateRef.advancing = true

  void enqueue(async () => {
    const store = usePlayerStore.getState()
    if (!store.isPlaying) {
      stateRef.advancing = false
      return
    }
    if (store.repeat === 'one') {
      usePlayerStore.getState().setPositionMs(0)
      stateRef.lastPositionMs = 0
      try {
        await player.seekTo(0)
      } catch {
        // Seek can fail mid-replace on web.
      }
      if (usePlayerStore.getState().isPlaying) {
        safePlay(player)
      }
      stateRef.advancing = false
      return
    }
    await enqueueReport(() => reportForCurrent('stop'))
    usePlayerStore.getState().goNext()
    if (!usePlayerStore.getState().isPlaying) {
      stateRef.advancing = false
    }
  })
}

const applyPause = (player: AudioPlayer) => {
  // Immediate — never wait behind load / network work.
  stateRef.transportGen += 1
  try {
    player.pause()
  } catch {
    // Ignore mid-replace pause failures.
  }
  void enqueueReport(() => reportForCurrent('progress'))
}

const applyPlayPlan = (player: AudioPlayer, plan: TransportPlan) => {
  const gen = ++stateRef.transportGen

  void enqueue(async () => {
    if (gen !== stateRef.transportGen) return

    if (plan.mintSession) {
      // UI skips change the track before the engine runs — stop the prior listen.
      if (stateRef.scrobble) {
        await enqueueReport(() => stopAnchoredScrobble())
      }
      if (gen !== stateRef.transportGen) return
      usePlayerStore.getState().setPlaySessionId(newPlaySessionId())
    }

    const loaded = await loadCurrent(player)
    if (gen !== stateRef.transportGen) return
    if (!usePlayerStore.getState().isPlaying) return

    if (!loaded) {
      logger.warn('audio.source_failed')
      usePlayerStore.getState().setPlaying(false)
      return
    }

    if (plan.reportStart && Platform.OS !== 'web') {
      const track = currentTrack(usePlayerStore.getState())
      player.setActiveForLockScreen(
        true,
        {
          title: track?.title,
          artist: track?.artist,
          albumTitle: track?.album,
          artworkUrl: track?.artworkUrl,
        },
        {
          showSeekForward: false,
          showSeekBackward: false,
          showNextTrack: true,
          showPreviousTrack: true,
        },
      )
    }

    if (gen !== stateRef.transportGen) return
    if (!usePlayerStore.getState().isPlaying) return

    if (plan.play) {
      safePlay(player)
    }

    // Scrobble off the audio path, but serialize reports so Progress
    // cannot beat Start (first scrub / pause after play).
    if (plan.reportStart) {
      void enqueueReport(() => reportForCurrent('start')).then(() => {
        void maybePrefetch()
      })
    } else if (plan.reportProgress) {
      void enqueueReport(() => reportForCurrent('progress'))
    }
  })
}

const syncFromStore = (player: AudioPlayer) => {
  const snap = usePlayerStore.getState()
  if (!snap.isPlaying || !currentTrack(snap)) return

  applyPlayPlan(player, {
    kind: snap.playSessionId ? 'resume' : 'start',
    mintSession: !snap.playSessionId,
    reportStart: !snap.playSessionId,
    reportProgress: Boolean(snap.playSessionId),
    play: true,
    pause: false,
  })
}

export const startPlaybackEngine = async (): Promise<Engine> => {
  if (stateRef.engine) return stateRef.engine
  if (stateRef.startPromise) return stateRef.startPromise

  // Fast Refresh can leave a prior engine's timer alive — dispose it.
  const prior = getGlobalSlot()
  if (prior) {
    try {
      prior.dispose()
    } catch {
      // Prior engine may already be torn down.
    }
    setGlobalSlot(null)
  }

  stateRef.startPromise = (async () => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    })

    const player = createAudioPlayer(null, {
      keepAudioSessionActive: KEEP_AUDIO_SESSION_ACTIVE,
      updateInterval: 500,
    })
    const session = useSessionStore.getState()
    if (session.context) {
      await postCapabilities(session.context)
    }

    const unsubPlayer = usePlayerStore.subscribe((state, prev) => {
      const trackChanged =
        state.currentIndex !== prev.currentIndex || state.tracks !== prev.tracks
      const plan = planTransport({
        wasPlaying: prev.isPlaying,
        isPlaying: state.isPlaying,
        trackChanged,
        hasPlaySession: Boolean(prev.playSessionId),
      })

      if (plan.kind === 'idle') return

      if (plan.kind === 'load') {
        void enqueue(async () => {
          // Track changed while paused — close the prior listen so the next
          // play mints a fresh session instead of "resuming" the wrong item.
          if (stateRef.scrobble) {
            await enqueueReport(() => stopAnchoredScrobble())
          }
          if (usePlayerStore.getState().playSessionId) {
            usePlayerStore.getState().setPlaySessionId(null)
          }
          await loadCurrent(player)
        })
        return
      }

      if (plan.pause) {
        applyPause(player)
        return
      }

      applyPlayPlan(player, plan)
    })

    const statusSub = player.addListener(
      'playbackStatusUpdate',
      (status: AudioStatus) => {
        if (status.didJustFinish) {
          advanceFromEnd(player)
        }
      },
    )

    const nextSub = player.addListener('remoteNextTrack', () => {
      usePlayerStore.getState().goNext()
    })
    const prevSub = player.addListener('remotePreviousTrack', () => {
      usePlayerStore.getState().goPrevious()
    })

    const progressTimer = setInterval(() => {
      const queue = usePlayerStore.getState()
      if (!queue.isPlaying) return

      if (
        mediaReachedEnd({
          isPlayingIntent: queue.isPlaying,
          mediaPlaying: player.playing,
          currentTimeSec: player.currentTime,
          durationSec: player.duration,
        })
      ) {
        advanceFromEnd(player)
        return
      }

      const reported = Math.round(player.currentTime * 1000)
      const decision = acceptReportedPosition(
        stateRef.seekGuard,
        reported,
        queue.positionMs,
        Date.now(),
      )
      stateRef.seekGuard = decision.guard
      if (decision.retrySeek) {
        try {
          player.seekTo(decision.positionMs / 1000)
        } catch {
          // Seek can fail mid-replace on web.
        }
      }
      if (!decision.accept) return
      stateRef.lastPositionMs = decision.positionMs
      usePlayerStore.getState().setPositionMs(decision.positionMs)
      const now = Date.now()
      if (!shouldFlushProgress(stateRef.lastProgressAt, now)) return
      stateRef.lastProgressAt = now
      void enqueueReport(() => reportForCurrent('progress'))
    }, 1000)

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        void enqueueReport(() => reportForCurrent('progress'))
      }
    })

    const engine: Engine = {
      player,
      dispose: () => {
        clearInterval(progressTimer)
        statusSub.remove()
        nextSub.remove()
        prevSub.remove()
        unsubPlayer()
        appSub.remove()
        if (Platform.OS !== 'web') {
          player.clearLockScreenControls()
        }
        player.remove()
        stateRef.engine = null
        stateRef.loadedUri = null
        stateRef.advancing = false
        stateRef.scrobble = null
        if (getGlobalSlot()?.dispose === engine.dispose) {
          setGlobalSlot(null)
        }
      },
    }
    stateRef.engine = engine
    setGlobalSlot(engine)

    // Catch play intent that landed before subscribe was attached.
    syncFromStore(player)

    return engine
  })()

  try {
    return await stateRef.startPromise
  } finally {
    stateRef.startPromise = null
  }
}

export const seekPlayback = async (positionMs: number): Promise<void> => {
  const clamped = Math.max(0, positionMs)
  stateRef.lastPositionMs = clamped
  stateRef.seekGuard = beginSeekGuard(clamped, Date.now())
  usePlayerStore.getState().setPositionMs(clamped)

  // First scrub often lands before the engine finishes starting — wait for it
  // instead of updating UI position while native stays put (then snaps back).
  const engine =
    stateRef.engine ??
    (await startPlaybackEngine().catch(() => null))
  if (!engine) return

  try {
    await engine.player.seekTo(clamped / 1000)
  } catch {
    // Seek can fail mid-replace on web.
  }

  // Tell Jellyfin immediately — interval flush alone misses seeks (esp. back).
  stateRef.lastProgressAt = Date.now()
  void enqueueReport(() => reportForCurrent('progress'))
}
