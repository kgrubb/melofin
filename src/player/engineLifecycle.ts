import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio'
import { AppState, Platform } from 'react-native'
import { useCastStore } from '@/src/cast/castStore'
import { KEEP_AUDIO_SESSION_ACTIVE } from '@/src/domain/audioSession'
import { POSITION_MOVE_MIN_MS } from '@/src/domain/playbackSource'
import {
  planTransport,
  shouldFlushProgress,
  type TransportPlan,
} from '@/src/domain/playbackReport'
import { newPlaySessionId } from '@/src/domain/playSessionId'
import { currentTrack, playingIdentity } from '@/src/domain/queue'
import {
  acceptReportedPosition,
  beginSeekGuard,
  idleSeekGuard,
} from '@/src/domain/seekPosition'
import { logger } from '@/src/logging/logger'
import { mediaReachedEnd } from '@/src/player/playbackEnd'
import {
  enqueue,
  getGlobalSlot,
  setGlobalSlot,
  stateRef,
  type Engine,
} from '@/src/player/engineState'
import {
  handleLoadFailure,
  loadCurrent,
  maybePrefetch,
  maybeStallFailover,
  recoverLocalOutput,
  safePlay,
} from '@/src/player/loadTrack'
import {
  bindLocalOutputChange,
  isLocalOutputEnabled,
  isMelioScrobbleEnabled,
  setLocalOutputEnabled,
} from '@/src/player/outputPolicy'
import { queueReport, reportForCurrent, stopAnchoredScrobble } from '@/src/player/scrobbleBridge'
import { postCapabilities } from '@/src/services/jellyfin/playbackReport'
import { flushCompletedListens } from '@/src/services/jellyfin/playstateSync'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'

const PLAYER_OPTS = {
  keepAudioSessionActive: KEEP_AUDIO_SESSION_ACTIVE,
  // 1s is enough for didJustFinish / status; position comes from our 500ms timer.
  // Lower intervals spam Now Playing + the JS bridge for no UX gain.
  updateInterval: 1000,
} as const

/** Progress fill is Reanimated; 1s is enough for labels/lyrics/drift. */
const UI_POSITION_MIN_MS = 1000

const activePlayer = (): AudioPlayer | null => stateRef.engine?.player ?? null

const applyPause = (player?: AudioPlayer | null) => {
  const target = player ?? activePlayer()
  stateRef.transportGen += 1
  if (target) {
    try {
      target.pause()
    } catch {
      // Ignore.
    }
  }
  if (isMelioScrobbleEnabled()) {
    void queueReport(() => reportForCurrent('progress'))
  }
}

/** Chromecast (etc.): Melio still owns Jellyfin playstate while local audio is muted. */
const syncRemoteScrobble = (
  state: ReturnType<typeof usePlayerStore.getState>,
  prev: ReturnType<typeof usePlayerStore.getState>,
  trackChanged: boolean,
) => {
  if (!isMelioScrobbleEnabled()) return
  if (trackChanged) {
    if (stateRef.scrobble) void queueReport(() => stopAnchoredScrobble())
    if (state.playSessionId) usePlayerStore.getState().setPlaySessionId(null)
    if (state.isPlaying && playingIdentity(state.tracks[state.currentIndex])) {
      usePlayerStore.getState().setPlaySessionId(newPlaySessionId())
      void queueReport(() => reportForCurrent('start'))
    }
    return
  }
  if (state.isPlaying === prev.isPlaying) return
  if (state.isPlaying) {
    if (!state.playSessionId) {
      usePlayerStore.getState().setPlaySessionId(newPlaySessionId())
      void queueReport(() => reportForCurrent('start'))
    } else {
      void queueReport(() => reportForCurrent('progress'))
    }
    return
  }
  void queueReport(() => reportForCurrent('progress'))
}

const ADVANCE_DEBOUNCE_MS = 750

const lockScreenMetadata = (track: ReturnType<typeof currentTrack>) => {
  if (!track) return undefined
  return {
    title: track.title,
    artist: track.artist,
    albumTitle: track.album,
    artworkUrl: track.artworkUrl,
    // Jellyfin mp3 streams often leave native duration at 0/NaN — supply catalog length.
    duration: track.durationMs > 0 ? track.durationMs / 1000 : undefined,
  }
}

const advanceFromEnd = () => {
  if (stateRef.advancing) return
  if (!usePlayerStore.getState().isPlaying) return
  const now = Date.now()
  if (now - stateRef.lastAdvanceAt < ADVANCE_DEBOUNCE_MS) return
  stateRef.advancing = true
  stateRef.lastAdvanceAt = now

  void enqueue(async () => {
    let waitForLoad = false
    try {
      const store = usePlayerStore.getState()
      if (!store.isPlaying) return
      const player = activePlayer()
      // Sleep "end of track" wins over repeat-one so the timer actually stops.
      if (store.sleep.endOfTrack) {
        if (isMelioScrobbleEnabled() && stateRef.scrobble) {
          void queueReport(() => stopAnchoredScrobble())
        }
        if (usePlayerStore.getState().consumeEndOfTrackSleep()) {
          applyPause(player)
        }
        return
      }
      if (store.repeat === 'one') {
        usePlayerStore.getState().setPositionMs(0)
        stateRef.lastPositionMs = 0
        if (player) {
          try {
            stateRef.seekGuard = beginSeekGuard(0, Date.now())
            await player.seekTo(0)
          } catch {
            // Ignore.
          }
        }
        if (usePlayerStore.getState().isPlaying && player) safePlay(player)
        return
      }
      // Freeze stop on the finished track before advancing the live queue.
      if (isMelioScrobbleEnabled() && stateRef.scrobble) {
        void queueReport(() => stopAnchoredScrobble())
      }
      usePlayerStore.getState().goNext()
      // Keep advancing until loadCurrent clears it so a slow replace cannot
      // double-fire EOF while native is still sitting on the prior item.
      waitForLoad =
        usePlayerStore.getState().isPlaying && isLocalOutputEnabled()
    } finally {
      if (!waitForLoad) stateRef.advancing = false
    }
  })
}

const applyPlayPlan = (plan: TransportPlan) => {
  recoverLocalOutput()
  const player = activePlayer()
  if (!player) return
  if (!isLocalOutputEnabled() && plan.play) {
    const sink = useCastStore.getState().transfer.active.kind
    logger.warn('audio.play_blocked_remote_output', { sink })
    applyPause(player)
    return
  }

  const gen = ++stateRef.transportGen

  void enqueue(async () => {
    if (gen !== stateRef.transportGen) return

    if (plan.mintSession) {
      // Do not await Jellyfin stop — network latency must not block the next load.
      if (stateRef.scrobble) {
        void queueReport(() => stopAnchoredScrobble())
      }
      usePlayerStore.getState().setPlaySessionId(newPlaySessionId())
    }

    if (gen !== stateRef.transportGen) return

    const current = activePlayer()
    if (!current) return
    // Only resume must re-seek; track changes reset store position to 0 and
    // should not inherit a stale progress-poll position from the prior item.
    const resumeMs =
      plan.kind === 'resume'
        ? Math.max(
            usePlayerStore.getState().positionMs,
            stateRef.lastPositionMs,
          )
        : undefined
    const loaded = await loadCurrent(current, {
      play: plan.play,
      transportGen: gen,
      ...(resumeMs != null && resumeMs > 0 ? { seekMs: resumeMs } : {}),
    })
    if (gen !== stateRef.transportGen) return
    if (!usePlayerStore.getState().isPlaying) return

    if (!loaded) {
      logger.warn('audio.source_failed')
      handleLoadFailure()
      return
    }

    const active = activePlayer()
    if (Platform.OS !== 'web' && active && usePlayerStore.getState().isPlaying) {
      const track = currentTrack(usePlayerStore.getState())
      // Idempotent native bind (remote handlers are cleared before re-add).
      // Needed on resume after engine recreate as well as track start.
      active.setActiveForLockScreen(
        true,
        lockScreenMetadata(track),
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

    if (plan.reportStart) {
      void queueReport(() => reportForCurrent('start')).then(() => {
        void maybePrefetch()
      })
    } else if (plan.reportProgress) {
      void queueReport(() => reportForCurrent('progress'))
    }
  })
}

const syncFromStore = () => {
  const snap = usePlayerStore.getState()
  if (!snap.isPlaying || !currentTrack(snap)) return
  applyPlayPlan({
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

    const player = createAudioPlayer(null, PLAYER_OPTS)
    const mediaUnsubs = { current: [] as (() => void)[] }

    const bindMediaListeners = (target: AudioPlayer) => {
      mediaUnsubs.current.forEach((u) => u())
      mediaUnsubs.current = []
      const statusSub = target.addListener(
        'playbackStatusUpdate',
        (status: AudioStatus) => {
          if (stateRef.replacing) return
          if (status.didJustFinish) advanceFromEnd()
        },
      )
      const nextSub = target.addListener('remoteNextTrack', () => {
        usePlayerStore.getState().goNext()
      })
      const prevSub = target.addListener('remotePreviousTrack', () => {
        usePlayerStore.getState().goPrevious()
      })
      const playSub = target.addListener('remotePlay', () => {
        usePlayerStore.getState().setPlaying(true)
      })
      const pauseSub = target.addListener('remotePause', () => {
        usePlayerStore.getState().setPlaying(false)
      })
      const seekSub = target.addListener(
        'remoteSeek',
        (event: { seconds?: number }) => {
          const seconds = event?.seconds
          if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return
          void seekPlayback(Math.round(seconds * 1000))
        },
      )
      mediaUnsubs.current = [
        () => statusSub.remove(),
        () => nextSub.remove(),
        () => prevSub.remove(),
        () => playSub.remove(),
        () => pauseSub.remove(),
        () => seekSub.remove(),
      ]
    }

    bindMediaListeners(player)

    bindLocalOutputChange((enabled, wasEnabled) => {
      if (!enabled) {
        applyPause()
        return
      }
      if (!wasEnabled) {
        syncFromStore()
      }
    })
    // Fresh engine owns local audio until cast transfers away.
    setLocalOutputEnabled(true)

    const session = useSessionStore.getState()
    if (session.context) {
      await postCapabilities(session.context)
    }
    void flushCompletedListens()

    const unsubPlayer = usePlayerStore.subscribe((state, prev) => {
      const prevTrackId = playingIdentity(prev.tracks[prev.currentIndex])
      const nextTrackId = playingIdentity(state.tracks[state.currentIndex])
      const trackChanged = prevTrackId !== nextTrackId
      // Position ticks must not re-enter transport (planTransport / recover).
      if (!trackChanged && state.isPlaying === prev.isPlaying) return

      recoverLocalOutput()
      if (!isLocalOutputEnabled()) {
        if (state.isPlaying !== prev.isPlaying && !state.isPlaying) {
          applyPause()
        }
        syncRemoteScrobble(state, prev, trackChanged)
        return
      }

      if (trackChanged) {
        // Drop prior-item times before the progress timer can poison the new load.
        stateRef.lastPositionMs = 0
        stateRef.seekGuard = idleSeekGuard()
        stateRef.stallFailoverDone = false
      }
      const plan = planTransport({
        wasPlaying: prev.isPlaying,
        isPlaying: state.isPlaying,
        trackChanged,
        hasPlaySession: Boolean(prev.playSessionId),
      })

      if (plan.kind === 'idle') return

      if (plan.kind === 'load') {
        void enqueue(async () => {
          if (stateRef.scrobble) {
            void queueReport(() => stopAnchoredScrobble())
          }
          if (usePlayerStore.getState().playSessionId) {
            usePlayerStore.getState().setPlaySessionId(null)
          }
          const current = activePlayer()
          if (current) await loadCurrent(current)
        })
        return
      }

      if (plan.pause) {
        applyPause()
        return
      }

      applyPlayPlan(plan)
    })

    const progressTimer = setInterval(() => {
      recoverLocalOutput()
      if (stateRef.replacing) return
      if (!isLocalOutputEnabled()) {
        if (!isMelioScrobbleEnabled()) return
        const queue = usePlayerStore.getState()
        if (!queue.isPlaying || !queue.playSessionId) return
        stateRef.lastPositionMs = queue.positionMs
        const now = Date.now()
        if (!shouldFlushProgress(stateRef.lastProgressAt, now)) return
        stateRef.lastProgressAt = now
        void queueReport(() => reportForCurrent('progress'))
        return
      }
      const active = activePlayer()
      if (!active) return
      const queue = usePlayerStore.getState()
      // Keep the stall clock fresh while paused so resume does not false-trigger.
      if (!queue.isPlaying) {
        stateRef.lastMovingAt = Date.now()
        return
      }

      const track = currentTrack(queue)
      if (
        mediaReachedEnd({
          isPlayingIntent: queue.isPlaying,
          mediaPlaying: active.playing,
          currentTimeSec: active.currentTime,
          durationSec: active.duration,
          fallbackDurationSec:
            track && track.durationMs > 0 ? track.durationMs / 1000 : undefined,
          uiPositionMs: queue.positionMs,
        })
      ) {
        advanceFromEnd()
        return
      }

      const reported = Math.round(active.currentTime * 1000)
      const decision = acceptReportedPosition(
        stateRef.seekGuard,
        reported,
        queue.positionMs,
        Date.now(),
      )
      stateRef.seekGuard = decision.guard
      if (decision.retrySeek) {
        try {
          active.seekTo(decision.positionMs / 1000)
        } catch {
          // Ignore.
        }
      }
      if (!decision.accept) return
      if (
        Math.abs(decision.positionMs - stateRef.lastPositionMs) >=
        POSITION_MOVE_MIN_MS
      ) {
        stateRef.lastMovingAt = Date.now()
      }
      stateRef.lastPositionMs = decision.positionMs
      if (
        Math.abs(decision.positionMs - queue.positionMs) >= UI_POSITION_MIN_MS
      ) {
        usePlayerStore.getState().setPositionMs(decision.positionMs)
      }
      maybeStallFailover(active)
      const now = Date.now()
      if (!shouldFlushProgress(stateRef.lastProgressAt, now)) return
      stateRef.lastProgressAt = now
      void queueReport(() => reportForCurrent('progress'))
    }, 500)

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        void queueReport(() => reportForCurrent('progress'))
      }
    })

    const engine: Engine = {
      player,
      dispose: () => {
        clearInterval(progressTimer)
        mediaUnsubs.current.forEach((u) => u())
        mediaUnsubs.current = []
        unsubPlayer()
        appSub.remove()
        bindLocalOutputChange(null)
        const active = activePlayer()
        if (Platform.OS !== 'web' && active) {
          try {
            active.clearLockScreenControls()
          } catch {
            // Ignore.
          }
        }
        if (active) {
          try {
            active.remove()
          } catch {
            // Ignore.
          }
        }
        stateRef.engine = null
        stateRef.loadedUri = null
        stateRef.advancing = false
        stateRef.lastAdvanceAt = 0
        stateRef.scrobble = null
        stateRef.playingFromCache = false
        stateRef.stallFailoverDone = false
        if (getGlobalSlot()?.dispose === engine.dispose) {
          setGlobalSlot(null)
        }
      },
    }
    stateRef.engine = engine
    setGlobalSlot(engine)
    syncFromStore()
    logger.info('audio.engine_started')
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
  stateRef.lastMovingAt = Date.now()
  stateRef.seekGuard = beginSeekGuard(clamped, Date.now())
  usePlayerStore.getState().setPositionMs(clamped)

  if (!isLocalOutputEnabled()) return

  const engine =
    stateRef.engine ??
    (await startPlaybackEngine().catch(() => null))
  if (!engine) return

  try {
    await engine.player.seekTo(clamped / 1000)
  } catch {
    // Ignore.
  }

  stateRef.lastProgressAt = Date.now()
  void queueReport(() => reportForCurrent('progress'))
}
