import type { AudioPlayer } from 'expo-audio'
import { idleSeekGuard, type SeekGuard } from '@/src/domain/seekPosition'

export type Engine = {
  player: AudioPlayer
  readonly dispose: () => void
}

export type ScrobbleAnchor = {
  readonly itemId: string
  readonly mediaSourceId?: string
  readonly playSessionId: string
  readonly playMethod: 'DirectPlay' | 'Transcode'
  readonly runtimeTicks: number
}

export const GLOBAL_ENGINE_KEY = '__melioPlaybackEngine'

type GlobalEngineSlot = {
  readonly dispose: () => void
}

export const getGlobalSlot = (): GlobalEngineSlot | null => {
  const slot = (globalThis as Record<string, unknown>)[GLOBAL_ENGINE_KEY]
  if (!slot || typeof slot !== 'object') return null
  if (!('dispose' in slot) || typeof (slot as GlobalEngineSlot).dispose !== 'function') {
    return null
  }
  return slot as GlobalEngineSlot
}

export const setGlobalSlot = (slot: GlobalEngineSlot | null) => {
  if (slot) {
    ;(globalThis as Record<string, unknown>)[GLOBAL_ENGINE_KEY] = slot
    return
  }
  delete (globalThis as Record<string, unknown>)[GLOBAL_ENGINE_KEY]
}

export const stateRef: {
  engine: Engine | null
  startPromise: Promise<Engine> | null
  lastProgressAt: number
  loadedUri: string | null
  loadEpoch: number
  transportGen: number
  queue: Promise<void>
  reportQueue: Promise<void>
  advancing: boolean
  /** Debounce double EOF signals during replace handoff. */
  lastAdvanceAt: number
  replacing: boolean
  scrobble: ScrobbleAnchor | null
  lastPositionMs: number
  seekGuard: SeekGuard
  playingFromCache: boolean
  lastMovingAt: number
  stallFailoverDone: boolean
  lastLoadAllRemotesFailed: boolean
  playbackVolume: number
  failedUris: Set<string>
  forceReload: boolean
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
  lastAdvanceAt: 0,
  replacing: false,
  scrobble: null,
  lastPositionMs: 0,
  seekGuard: idleSeekGuard(),
  playingFromCache: false,
  lastMovingAt: Date.now(),
  stallFailoverDone: false,
  lastLoadAllRemotesFailed: false,
  playbackVolume: 1,
  failedUris: new Set(),
  forceReload: false,
}

export const enqueue = (task: () => Promise<void>) => {
  stateRef.queue = stateRef.queue.then(task, task).then(
    () => undefined,
    () => undefined,
  )
  return stateRef.queue
}

export const enqueueReport = (task: () => Promise<unknown>) => {
  stateRef.reportQueue = stateRef.reportQueue.then(task, task).then(
    () => undefined,
    () => undefined,
  )
  return stateRef.reportQueue
}

export const yieldMs = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export const hostOf = (uri: string): string => {
  try {
    return new URL(uri).host || 'unknown'
  } catch {
    return 'invalid'
  }
}

export const isLoopbackHost = (uri: string): boolean => {
  try {
    const host = new URL(uri).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}
