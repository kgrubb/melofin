import { create } from 'zustand'
import {
  pushRecentPlayedId,
  stripAutoplayTracks,
} from '@/src/domain/autoplay'
import {
  clearUpcoming,
  emptyQueue,
  enqueue,
  expandTracksPreservingPlayback,
  insertTracksAt,
  moveQueueViewTrack as reorderQueueView,
  playQueueViewIndex as playFromQueueView,
  moveTrack,
  nextIndex,
  patchTrackFavorite,
  playItems,
  playNext,
  previousIndex,
  queueViewIndices,
  removeAt,
  setRepeat,
  setShuffle,
  skipTo,
  storeIndexAfterViewMove,
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
import { useSettingsStore } from '@/src/store/settings'

export type QueueSource = {
  readonly kind: 'album' | 'artist' | 'playlist' | 'mix'
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
  /** Session Autoplay — seeded from Settings on playQueue. */
  readonly autoplaySessionOn: boolean
  /** First index of Autoplay-recommended tracks, if any. */
  readonly autoplayAnchorIndex: number | null
  /** True after at least one Autoplay batch was appended. */
  readonly autoplayActive: boolean
  /** Recent track ids this session (Autoplay dedupe). */
  readonly recentPlayedIds: readonly string[]
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
    shuffle?: boolean,
    /** Seek here after load (Continue Listening). Other callers leave 0. */
    startPositionMs?: number,
  ) => void
  /** Replace queue tracks while keeping the current track id and playhead. */
  readonly setQueueTracksPreservingPlayback: (items: readonly QueueTrack[]) => void
  readonly enqueueTracks: (items: readonly QueueTrack[]) => void
  readonly appendAutoplayTracks: (items: readonly QueueTrack[]) => void
  readonly playNextTracks: (items: readonly QueueTrack[]) => void
  readonly removeTrackAt: (index: number) => void
  readonly moveQueueTrack: (from: number, to: number) => void
  /** Reorder by Queue screen indices (honors shuffle play order). */
  readonly moveQueueViewTrack: (fromView: number, toView: number) => void
  readonly clearUpcomingTracks: () => void
  readonly setTrackFavorite: (itemId: string, isFavorite: boolean) => void
  readonly setSleepMinutes: (minutes: number) => void
  readonly setSleepEndOfTrack: () => void
  readonly clearSleep: () => void
  readonly consumeEndOfTrackSleep: () => boolean
  readonly toggleShuffle: () => void
  readonly cycleRepeat: () => void
  readonly toggleAutoplaySession: () => void
  readonly setAutoplaySessionOn: (on: boolean) => void
  /** Turn Autoplay on (Settings + session) and treat `anchorIndex` as the first Recommended slot. */
  readonly armAutoplaySession: (anchorIndex: number) => void
  readonly notePlayedTrackId: (trackId: string | undefined) => void
  readonly skipToIndex: (index: number) => void
  readonly playAtIndex: (index: number) => void
  /** Play a Queue-screen row (keeps shuffle upcoming). */
  readonly playQueueViewIndex: (viewIndex: number) => void
  readonly goNext: () => void
  readonly goPrevious: () => void
  readonly reset: () => void
}

const cycle = (mode: RepeatMode): RepeatMode => {
  if (mode === 'off') return 'all'
  if (mode === 'all') return 'one'
  return 'off'
}

const clearAutoplaySession = () =>
  ({
    autoplayAnchorIndex: null as number | null,
    autoplayActive: false,
    recentPlayedIds: [] as readonly string[],
  }) as const

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

const primeNativeNext = () => {
  void import('@/src/player/nativeQueue').then(({ primeNextIfEnabled }) => {
    void primeNextIfEnabled()
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
  autoplaySessionOn: true,
  ...clearAutoplaySession(),
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
      ...clearAutoplaySession(),
    }),
  playQueue: (items, startIndex = 0, source = null, shuffle, startPositionMs = 0) => {
    ensurePlaybackEngine()
    const prev = get()
    const base = shuffle === undefined ? prev : { ...prev, shuffle }
    set({
      ...playItems(base, items, startIndex),
      positionMs: Math.max(0, startPositionMs),
      queueSource: source,
      isPlaying: true,
      queueGen: prev.queueGen + 1,
      autoplaySessionOn: useSettingsStore.getState().autoplayEnabled,
      ...clearAutoplaySession(),
    })
  },
  setQueueTracksPreservingPlayback: (items) => {
    set(expandTracksPreservingPlayback(get(), items))
    primeNativeNext()
  },
  enqueueTracks: (items) => {
    if (items.length === 0) return
    const prev = get()
    const anchor = prev.autoplayAnchorIndex
    if (anchor != null) {
      const at = Math.min(anchor, prev.tracks.length)
      set({
        ...insertTracksAt(prev, items, at),
        autoplayAnchorIndex: at + items.length,
      })
    } else {
      set(enqueue(prev, items))
    }
    primeNativeNext()
  },
  appendAutoplayTracks: (items) => {
    if (items.length === 0) return
    const prev = get()
    const start = prev.tracks.length
    set({
      ...enqueue(prev, items),
      autoplayAnchorIndex: prev.autoplayAnchorIndex ?? start,
      autoplayActive: true,
    })
    primeNativeNext()
  },
  playNextTracks: (items) => {
    if (items.length === 0) return
    const prev = get()
    const insertAt =
      prev.tracks.length === 0 || prev.currentIndex < 0
        ? 0
        : prev.currentIndex + 1
    let autoplayAnchorIndex = prev.autoplayAnchorIndex
    if (autoplayAnchorIndex != null && insertAt <= autoplayAnchorIndex) {
      autoplayAnchorIndex += items.length
    }
    set({ ...playNext(prev, items), autoplayAnchorIndex })
    primeNativeNext()
  },
  removeTrackAt: (index) => {
    const prev = get()
    const prevIndex = prev.currentIndex
    const next = removeAt(prev, index)
    let autoplayAnchorIndex = prev.autoplayAnchorIndex
    if (autoplayAnchorIndex != null) {
      if (index < autoplayAnchorIndex) autoplayAnchorIndex -= 1
      else if (index === autoplayAnchorIndex) {
        autoplayAnchorIndex =
          autoplayAnchorIndex < next.tracks.length ? autoplayAnchorIndex : null
      }
    }
    set({
      ...next,
      positionMs: index === prevIndex ? 0 : prev.positionMs,
      isPlaying: next.tracks.length === 0 ? false : prev.isPlaying,
      autoplayAnchorIndex,
      autoplayActive:
        autoplayAnchorIndex != null ? prev.autoplayActive : false,
    })
    primeNativeNext()
  },
  moveQueueTrack: (from, to) => {
    set(moveTrack(get(), from, to))
    primeNativeNext()
  },
  moveQueueViewTrack: (fromView, toView) => {
    const prev = get()
    const next = reorderQueueView(prev, fromView, toView)
    if (next === prev) return
    const shuffled =
      prev.shuffle && prev.shuffleOrder.length === prev.tracks.length
    let autoplayAnchorIndex = prev.autoplayAnchorIndex
    if (!shuffled && autoplayAnchorIndex != null) {
      const view = queueViewIndices(prev)
      const fromStore = view[fromView]
      const toStore = view[toView]
      if (fromStore != null && toStore != null) {
        autoplayAnchorIndex = storeIndexAfterViewMove(
          autoplayAnchorIndex,
          fromStore,
          toStore,
        )
      }
    }
    set({ ...next, autoplayAnchorIndex })
    primeNativeNext()
  },
  clearUpcomingTracks: () => {
    set({
      ...clearUpcoming(get()),
      autoplayAnchorIndex: null,
      autoplayActive: false,
    })
    primeNativeNext()
  },
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
  toggleShuffle: () => {
    set(setShuffle(get(), !get().shuffle))
    primeNativeNext()
  },
  cycleRepeat: () => {
    set(setRepeat(get(), cycle(get().repeat)))
    primeNativeNext()
  },
  toggleAutoplaySession: () => {
    const nextOn = !get().autoplaySessionOn
    get().setAutoplaySessionOn(nextOn)
    void useSettingsStore.getState().setAutoplayEnabled(nextOn)
  },
  setAutoplaySessionOn: (on) => {
    if (on) {
      set({ autoplaySessionOn: true })
      return
    }
    const prev = get()
    set({
      ...stripAutoplayTracks(prev, prev.autoplayAnchorIndex),
      autoplaySessionOn: false,
      autoplayAnchorIndex: null,
      autoplayActive: false,
    })
    primeNativeNext()
  },
  armAutoplaySession: (anchorIndex) => {
    set({
      autoplaySessionOn: true,
      autoplayActive: true,
      autoplayAnchorIndex: Math.max(0, anchorIndex),
    })
    void useSettingsStore.getState().setAutoplayEnabled(true)
  },
  notePlayedTrackId: (trackId) => {
    set({ recentPlayedIds: pushRecentPlayedId(get().recentPlayedIds, trackId) })
  },
  skipToIndex: (index) => {
    if (get().isPlaying) ensurePlaybackEngine()
    set({ ...skipTo(get(), index), positionMs: 0 })
  },
  playAtIndex: (index) => {
    ensurePlaybackEngine()
    set({ ...skipTo(get(), index), positionMs: 0, isPlaying: true })
  },
  playQueueViewIndex: (viewIndex) => {
    ensurePlaybackEngine()
    set({
      ...playFromQueueView(get(), viewIndex),
      positionMs: 0,
      isPlaying: true,
    })
    primeNativeNext()
  },
  goNext: () => {
    ensurePlaybackEngine()
    const state = get()
    const next = nextIndex(state)
    if (next < 0) {
      void import('@/src/player/autoplayContinuation').then(
        ({ goNextWithAutoplay }) => {
          void goNextWithAutoplay()
        },
      )
      return
    }
    const leaving = state.tracks[state.currentIndex]
    // Always keep play intent — skip while "paused" should still load+play.
    set({
      ...skipTo(state, next),
      positionMs: 0,
      isPlaying: true,
      recentPlayedIds: pushRecentPlayedId(state.recentPlayedIds, leaving?.id),
    })
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
      autoplaySessionOn: useSettingsStore.getState().autoplayEnabled,
      ...clearAutoplaySession(),
    })
    notifySleepChanged()
  },
}))
