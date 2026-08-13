import { create } from 'zustand'
import {
  clearUpcoming,
  emptyQueue,
  enqueue,
  expandTracksPreservingPlayback,
  moveTrack,
  nextIndex,
  patchTrackFavorite,
  playItems,
  playNext,
  previousIndex,
  removeAt,
  setRepeat,
  setShuffle,
  skipTo,
  type QueueState,
  type QueueTrack,
  type RepeatMode,
} from '@/src/domain/queue'
import {
  sleepEndOfTrack,
  sleepOff,
  sleepUntil,
  type SleepTimerState,
} from '@/src/domain/sleepTimer'

export type QueueSource = {
  readonly kind: 'album' | 'artist' | 'playlist'
  readonly id: string
}

/** Last measured mini-player window rect for expand/collapse morph. */
export type MiniPlayerFrame = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type PlayerStore = QueueState & {
  readonly isPlaying: boolean
  readonly positionMs: number
  readonly playSessionId: string | null
  /** Full Now Playing sheet is on screen (covers mini player). */
  readonly nowPlayingOpen: boolean
  /** Last measured mini player rect in window coordinates. */
  readonly miniPlayerFrame: MiniPlayerFrame | null
  /** Collection that seeded the current queue, if any. */
  readonly queueSource: QueueSource | null
  /** Bumped on play/replace/reset so async queue expands can ignore stale work. */
  readonly queueGen: number
  readonly sleep: SleepTimerState
  readonly setPlaying: (playing: boolean) => void
  readonly togglePlaying: () => void
  readonly setPositionMs: (positionMs: number) => void
  readonly setPlaySessionId: (id: string | null) => void
  readonly setNowPlayingOpen: (open: boolean) => void
  readonly setMiniPlayerFrame: (frame: MiniPlayerFrame) => void
  readonly seekTo: (positionMs: number) => void
  readonly replaceQueue: (
    items: readonly QueueTrack[],
    startIndex?: number,
    source?: QueueSource | null,
  ) => void
  readonly playQueue: (
    items: readonly QueueTrack[],
    startIndex?: number,
    source?: QueueSource | null,
  ) => void
  /** Replace queue tracks while keeping the current track id and playhead. */
  readonly setQueueTracksPreservingPlayback: (items: readonly QueueTrack[]) => void
  readonly enqueueTracks: (items: readonly QueueTrack[]) => void
  readonly playNextTracks: (items: readonly QueueTrack[]) => void
  readonly removeTrackAt: (index: number) => void
  readonly moveQueueTrack: (from: number, to: number) => void
  readonly clearUpcomingTracks: () => void
  readonly setTrackFavorite: (itemId: string, isFavorite: boolean) => void
  readonly setSleepMinutes: (minutes: number) => void
  readonly setSleepEndOfTrack: () => void
  readonly clearSleep: () => void
  readonly consumeEndOfTrackSleep: () => boolean
  readonly toggleShuffle: () => void
  readonly cycleRepeat: () => void
  readonly skipToIndex: (index: number) => void
  readonly playAtIndex: (index: number) => void
  readonly goNext: () => void
  readonly goPrevious: () => void
  readonly reset: () => void
}

const cycle = (mode: RepeatMode): RepeatMode => {
  if (mode === 'off') return 'all'
  if (mode === 'all') return 'one'
  return 'off'
}

/**
 * Bind the native engine on every transport intent.
 * Dynamic import avoids a store ↔ engine cycle; HMR can drop module state.
 */
const ensurePlaybackEngine = () => {
  void import('@/src/player/playlistEngine').then(({ startPlaybackEngine }) => {
    void startPlaybackEngine()
  })
}

const seekEngine = (positionMs: number) => {
  void import('@/src/player/playlistEngine').then(({ seekPlayback }) => {
    void seekPlayback(positionMs)
  })
}

const notifySleepChanged = () => {
  void import('@/src/player/sleepWatch').then(({ syncSleepWatch }) => {
    syncSleepWatch()
  })
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  ...emptyQueue(),
  isPlaying: false,
  positionMs: 0,
  playSessionId: null,
  nowPlayingOpen: false,
  miniPlayerFrame: null,
  queueSource: null,
  queueGen: 0,
  sleep: sleepOff(),
  setPlaying: (isPlaying) => {
    if (isPlaying) ensurePlaybackEngine()
    set({ isPlaying })
  },
  togglePlaying: () => {
    const isPlaying = !get().isPlaying
    if (isPlaying) ensurePlaybackEngine()
    set({ isPlaying })
  },
  setPositionMs: (positionMs) => {
    if (get().positionMs === positionMs) return
    set({ positionMs })
  },
  setPlaySessionId: (playSessionId) => set({ playSessionId }),
  setNowPlayingOpen: (nowPlayingOpen) => set({ nowPlayingOpen }),
  setMiniPlayerFrame: (miniPlayerFrame) => set({ miniPlayerFrame }),
  seekTo: (positionMs) => {
    ensurePlaybackEngine()
    const clamped = Math.max(0, positionMs)
    set({ positionMs: clamped })
    seekEngine(clamped)
    void import('@/src/cast/router').then(({ seekActive }) => {
      void seekActive(clamped)
    })
  },
  replaceQueue: (items, startIndex = 0, source = null) =>
    set({
      ...playItems(get(), items, startIndex),
      positionMs: 0,
      queueSource: source,
      queueGen: get().queueGen + 1,
    }),
  playQueue: (items, startIndex = 0, source = null) => {
    ensurePlaybackEngine()
    set({
      ...playItems(get(), items, startIndex),
      positionMs: 0,
      queueSource: source,
      isPlaying: true,
      queueGen: get().queueGen + 1,
    })
  },
  setQueueTracksPreservingPlayback: (items) => {
    set(expandTracksPreservingPlayback(get(), items))
  },
  enqueueTracks: (items) => set(enqueue(get(), items)),
  playNextTracks: (items) => set(playNext(get(), items)),
  removeTrackAt: (index) => {
    const prevIndex = get().currentIndex
    const next = removeAt(get(), index)
    set({ ...next, positionMs: index === prevIndex ? 0 : get().positionMs })
  },
  moveQueueTrack: (from, to) => set(moveTrack(get(), from, to)),
  clearUpcomingTracks: () => set(clearUpcoming(get())),
  setTrackFavorite: (itemId, isFavorite) => set(patchTrackFavorite(get(), itemId, isFavorite)),
  setSleepMinutes: (minutes) => {
    set({ sleep: sleepUntil(Date.now() + minutes * 60_000) })
    notifySleepChanged()
  },
  setSleepEndOfTrack: () => {
    set({ sleep: sleepEndOfTrack() })
    notifySleepChanged()
  },
  clearSleep: () => {
    set({ sleep: sleepOff() })
    notifySleepChanged()
  },
  consumeEndOfTrackSleep: () => {
    if (!get().sleep.endOfTrack) return false
    set({ sleep: sleepOff(), isPlaying: false })
    notifySleepChanged()
    return true
  },
  toggleShuffle: () => set(setShuffle(get(), !get().shuffle)),
  cycleRepeat: () => set(setRepeat(get(), cycle(get().repeat))),
  skipToIndex: (index) => {
    if (get().isPlaying) ensurePlaybackEngine()
    set({ ...skipTo(get(), index), positionMs: 0 })
  },
  playAtIndex: (index) => {
    ensurePlaybackEngine()
    set({ ...skipTo(get(), index), positionMs: 0, isPlaying: true })
  },
  goNext: () => {
    ensurePlaybackEngine()
    const next = nextIndex(get())
    if (next < 0) {
      set({ isPlaying: false })
      return
    }
    // Always keep play intent — skip while "paused" should still load+play.
    set({ ...skipTo(get(), next), positionMs: 0, isPlaying: true })
  },
  goPrevious: () => {
    ensurePlaybackEngine()
    if (get().positionMs > 3000) {
      get().seekTo(0)
      return
    }
    const prev = previousIndex(get())
    if (prev === get().currentIndex) {
      get().seekTo(0)
      return
    }
    set({ ...skipTo(get(), prev), positionMs: 0, isPlaying: true })
  },
  reset: () => {
    set({
      ...emptyQueue(),
      isPlaying: false,
      positionMs: 0,
      playSessionId: null,
      nowPlayingOpen: false,
      miniPlayerFrame: null,
      queueSource: null,
      queueGen: get().queueGen + 1,
      sleep: sleepOff(),
    })
    notifySleepChanged()
  },
}))
