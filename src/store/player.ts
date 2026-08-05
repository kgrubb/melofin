import { create } from 'zustand'
import {
  emptyQueue,
  enqueue,
  moveTrack,
  nextIndex,
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

export type QueueSource = {
  readonly kind: 'album' | 'artist' | 'playlist'
  readonly id: string
}

type PlayerStore = QueueState & {
  readonly isPlaying: boolean
  readonly positionMs: number
  readonly playSessionId: string | null
  /** Full Now Playing sheet is on screen (covers mini player). */
  readonly nowPlayingOpen: boolean
  /** Collection that seeded the current queue, if any. */
  readonly queueSource: QueueSource | null
  readonly setPlaying: (playing: boolean) => void
  readonly setPositionMs: (positionMs: number) => void
  readonly setPlaySessionId: (id: string | null) => void
  readonly setNowPlayingOpen: (open: boolean) => void
  readonly seekTo: (positionMs: number) => void
  readonly replaceQueue: (
    items: readonly QueueTrack[],
    startIndex?: number,
    source?: QueueSource | null,
  ) => void
  readonly enqueueTracks: (items: readonly QueueTrack[]) => void
  readonly playNextTracks: (items: readonly QueueTrack[]) => void
  readonly removeTrackAt: (index: number) => void
  readonly move: (from: number, to: number) => void
  readonly toggleShuffle: () => void
  readonly cycleRepeat: () => void
  readonly skipToIndex: (index: number) => void
  readonly goNext: () => void
  readonly goPrevious: () => void
  readonly reset: () => void
}

const cycle = (mode: RepeatMode): RepeatMode => {
  if (mode === 'off') return 'all'
  if (mode === 'all') return 'one'
  return 'off'
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
  queueSource: null,
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPositionMs: (positionMs) => set({ positionMs }),
  setPlaySessionId: (playSessionId) => set({ playSessionId }),
  setNowPlayingOpen: (nowPlayingOpen) => set({ nowPlayingOpen }),
  seekTo: (positionMs) => {
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
  enqueueTracks: (items) => set(enqueue(get(), items)),
  playNextTracks: (items) => set(playNext(get(), items)),
  removeTrackAt: (index) => set(removeAt(get(), index)),
  move: (from, to) => set(moveTrack(get(), from, to)),
  toggleShuffle: () => set(setShuffle(get(), !get().shuffle)),
  cycleRepeat: () => set(setRepeat(get(), cycle(get().repeat))),
  skipToIndex: (index) => set({ ...skipTo(get(), index), positionMs: 0 }),
  goNext: () => {
    const next = nextIndex(get())
    if (next < 0) {
      set({ isPlaying: false })
      return
    }
    set({ ...skipTo(get(), next), positionMs: 0 })
  },
  goPrevious: () => {
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
      queueSource: null,
    }),
}))
