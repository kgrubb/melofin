import { create } from 'zustand'
import {
  emptyQueue,
  enqueue,
  nextIndex,
  playItems,
  previousIndex,
  setRepeat,
  setShuffle,
  skipTo,
  type QueueState,
  type QueueTrack,
  type RepeatMode,
} from '@/src/domain/queue'

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
  readonly enqueueTracks: (items: readonly QueueTrack[]) => void
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

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  ...emptyQueue(),
  isPlaying: false,
  positionMs: 0,
  playSessionId: null,
  nowPlayingOpen: false,
  miniPlayerFrame: null,
  queueSource: null,
  setPlaying: (isPlaying) => {
    if (isPlaying) ensurePlaybackEngine()
    set({ isPlaying })
  },
  togglePlaying: () => {
    const isPlaying = !get().isPlaying
    if (isPlaying) ensurePlaybackEngine()
    set({ isPlaying })
  },
  setPositionMs: (positionMs) => set({ positionMs }),
  setPlaySessionId: (playSessionId) => set({ playSessionId }),
  setNowPlayingOpen: (nowPlayingOpen) => set({ nowPlayingOpen }),
  setMiniPlayerFrame: (miniPlayerFrame) => set({ miniPlayerFrame }),
  seekTo: (positionMs) => {
    ensurePlaybackEngine()
    const clamped = Math.max(0, positionMs)
    set({ positionMs: clamped })
    seekEngine(clamped)
  },
  replaceQueue: (items, startIndex = 0, source = null) =>
    set({
      ...playItems(get(), items, startIndex),
      positionMs: 0,
      queueSource: source,
    }),
  playQueue: (items, startIndex = 0, source = null) => {
    ensurePlaybackEngine()
    set({
      ...playItems(get(), items, startIndex),
      positionMs: 0,
      queueSource: source,
      isPlaying: true,
    })
  },
  enqueueTracks: (items) => set(enqueue(get(), items)),
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
    set({ ...skipTo(get(), next), positionMs: 0 })
  },
  goPrevious: () => {
    ensurePlaybackEngine()
    if (get().positionMs > 3000) {
      seekEngine(0)
      return
    }
    const prev = previousIndex(get())
    set({ ...skipTo(get(), prev), positionMs: 0 })
  },
  reset: () =>
    set({
      ...emptyQueue(),
      isPlaying: false,
      positionMs: 0,
      playSessionId: null,
      nowPlayingOpen: false,
      miniPlayerFrame: null,
      queueSource: null,
    }),
}))
