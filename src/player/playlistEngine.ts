import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio'
import { AppState, Platform } from 'react-native'
import { msToTicks } from '@/src/domain/jellyfin'
import { currentTrack, prefetchTargets } from '@/src/domain/queue'
import { shouldFlushProgress } from '@/src/domain/playbackReport'
import { downloadTrack } from '@/src/offline/downloader'
import { mediaReachedEnd } from '@/src/player/playbackEnd'
import { resolveTrackSource } from '@/src/player/trackResolver'
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

const stateRef: {
  engine: Engine | null
  lastProgressAt: number
  loadedUri: string | null
  loadEpoch: number
  queue: Promise<void>
  advancing: boolean
} = {
  engine: null,
  lastProgressAt: 0,
  loadedUri: null,
  loadEpoch: 0,
  queue: Promise.resolve(),
  advancing: false,
}


const enqueue = (task: () => Promise<void>) => {
  stateRef.queue = stateRef.queue.then(task, task).then(
    () => undefined,
    () => undefined,
  )
  return stateRef.queue
}

const waitForLoaded = (player: AudioPlayer, epoch: number): Promise<boolean> =>
  new Promise((resolve) => {
    if (player.isLoaded) {
      resolve(true)
      return
    }

    const finish = (ok: boolean) => {
      clearTimeout(timeout)
      subscription.remove()
      resolve(ok)
    }

    const timeout = setTimeout(() => finish(player.isLoaded), 12_000)
    const subscription = player.addListener(
      'playbackStatusUpdate',
      (status: AudioStatus) => {
        if (epoch !== stateRef.loadEpoch) {
          finish(false)
          return
        }
        if (status.isLoaded) {
          finish(true)
          return
        }
        if (status.error) {
          finish(false)
        }
      },
    )
  })

const loadCurrent = async (player: AudioPlayer): Promise<boolean> => {
  stateRef.advancing = false
  const queue = usePlayerStore.getState()
  const session = useSessionStore.getState()
  const settings = useSettingsStore.getState()
  const track = currentTrack(queue)
  if (!track || !session.session || !session.context) return false
  const resolved = resolveTrackSource(
    track,
    settings.offlineIndex,
    session.context,
    session.session.userId,
  )
  if (!resolved) return false

  if (stateRef.loadedUri === resolved.uri && player.isLoaded) {
    return true
  }

  const epoch = ++stateRef.loadEpoch
  stateRef.loadedUri = resolved.uri
  // expo-audio's web replace() immediately play()s if wasPlaying, before the new
  // media element has a loaded source — that throws NotSupportedError.
  if (player.playing) {
    player.pause()
  }
  player.replace({
    uri: resolved.uri,
    name: track.title,
  })
  return waitForLoaded(player, epoch)
}

const safePlay = (player: AudioPlayer) => {
  try {
    player.play()
  } catch {
    // Web HTMLMediaElement can throw synchronously if the element is mid-replace.
  }
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

  if (phase === 'start') await reportStart(session.context, payload)
  if (phase === 'progress') await reportProgress(session.context, payload)
  if (phase === 'stop') await reportStop(session.context, payload)
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
      try {
        await player.seekTo(0)
      } catch {
        // Seek can fail mid-replace on web.
      }
      safePlay(player)
      stateRef.advancing = false
      return
    }
    await reportForCurrent('stop')
    usePlayerStore.getState().goNext()
    if (!usePlayerStore.getState().isPlaying) {
      stateRef.advancing = false
    }
  })
}

export const startPlaybackEngine = async (): Promise<Engine> => {
  if (stateRef.engine) return stateRef.engine

  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  })

  const player = createAudioPlayer(null)
  const session = useSessionStore.getState()
  if (session.context) {
    await postCapabilities(session.context)
  }

  const unsubPlayer = usePlayerStore.subscribe((state, prev) => {
    const trackChanged =
      state.currentIndex !== prev.currentIndex || state.tracks !== prev.tracks
    const started = state.isPlaying && !prev.isPlaying
    const paused = !state.isPlaying && prev.isPlaying

    if (trackChanged || started) {
      void enqueue(async () => {
        if (started) {
          usePlayerStore.getState().setPlaySessionId(crypto.randomUUID())
        }
        const loaded = await loadCurrent(player)
        if (started) {
          const track = currentTrack(usePlayerStore.getState())
          if (Platform.OS !== 'web') {
            player.setActiveForLockScreen(
              true,
              {
                title: track?.title,
                artist: track?.artist,
                albumTitle: track?.album,
                artworkUrl: track?.artworkUrl,
              },
              {
                showSeekForward: true,
                showSeekBackward: true,
              },
            )
          }
          if (loaded || Platform.OS !== 'web') {
            safePlay(player)
          }
          await reportForCurrent('start')
          await maybePrefetch()
          return
        }
        if (usePlayerStore.getState().isPlaying && loaded) {
          safePlay(player)
        }
      })
    }

    if (paused) {
      void enqueue(async () => {
        player.pause()
        await reportForCurrent('progress')
      })
    }
  })

  const statusSub = player.addListener(
    'playbackStatusUpdate',
    (status: AudioStatus) => {
      if (status.didJustFinish) {
        advanceFromEnd(player)
      }
    },
  )

  const progressTimer = setInterval(() => {
    const queue = usePlayerStore.getState()
    if (!queue.isPlaying) return

    // Web: expo-audio often omits an explicit finish event on `ended`.
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
    // Skip transient 0 reports while already deep into a track.
    if (reported === 0 && queue.positionMs > 2000) return
    usePlayerStore.getState().setPositionMs(reported)
    const now = Date.now()
    if (!shouldFlushProgress(stateRef.lastProgressAt, now)) return
    stateRef.lastProgressAt = now
    void reportForCurrent('progress')
  }, 1000)

  const appSub = AppState.addEventListener('change', (next) => {
    if (next === 'background' || next === 'inactive') {
      void reportForCurrent('progress')
    }
  })

  const engine: Engine = {
    player,
    dispose: () => {
      clearInterval(progressTimer)
      statusSub.remove()
      unsubPlayer()
      appSub.remove()
      if (Platform.OS !== 'web') {
        player.clearLockScreenControls()
      }
      player.remove()
      stateRef.engine = null
      stateRef.loadedUri = null
      stateRef.advancing = false
    },
  }
  stateRef.engine = engine
  return engine
}


export const getPlaybackEngine = (): Engine | null => stateRef.engine

export const seekPlayback = async (positionMs: number): Promise<void> => {
  const engine = stateRef.engine
  const clamped = Math.max(0, positionMs)
  usePlayerStore.getState().setPositionMs(clamped)
  if (!engine) return
  try {
    await engine.player.seekTo(clamped / 1000)
  } catch {
    // Seek can fail mid-replace on web.
  }
}

export const seekToMs = seekPlayback
