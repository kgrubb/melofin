export type QueueTrack = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly durationMs: number
  readonly artworkUrl?: string
  readonly mediaSourceId?: string
  readonly albumId?: string
  readonly artistId?: string
}

export type RepeatMode = 'off' | 'one' | 'all'

export type QueueState = {
  readonly tracks: readonly QueueTrack[]
  readonly currentIndex: number
  readonly shuffle: boolean
  readonly repeat: RepeatMode
  readonly shuffleOrder: readonly number[]
}

export const emptyQueue = (): QueueState => ({
  tracks: [],
  currentIndex: -1,
  shuffle: false,
  repeat: 'off',
  shuffleOrder: [],
})

const clampIndex = (index: number, length: number): number => {
  if (length === 0) return -1
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}

const shuffledIndices = (length: number, seed: number): readonly number[] => {
  const indices = Array.from({ length }, (_, i) => i)
  const random = (n: number): number => {
    const x = Math.sin(seed + n) * 10000
    return x - Math.floor(x)
  }
  return indices.reduceRight((acc, _, i) => {
    if (i === 0) return acc
    const j = Math.floor(random(i) * (i + 1))
    const next = [...acc]
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
    return next
  }, indices)
}

export const playItems = (
  state: QueueState,
  items: readonly QueueTrack[],
  startIndex = 0,
): QueueState => {
  if (items.length === 0) return emptyQueue()
  const shuffleOrder = state.shuffle
    ? shuffledIndices(items.length, items.length + startIndex)
    : []
  const currentIndex =
    state.shuffle && shuffleOrder.length > 0 && startIndex === 0
      ? shuffleOrder[0]!
      : clampIndex(startIndex, items.length)
  return {
    tracks: items,
    currentIndex,
    shuffle: state.shuffle,
    repeat: state.repeat,
    shuffleOrder,
  }
}

export const enqueue = (state: QueueState, items: readonly QueueTrack[]): QueueState => {
  if (items.length === 0) return state
  const tracks = [...state.tracks, ...items]
  return {
    ...state,
    tracks,
    currentIndex: state.currentIndex < 0 ? 0 : state.currentIndex,
    shuffleOrder: state.shuffle
      ? shuffledIndices(tracks.length, tracks.length)
      : state.shuffleOrder,
  }
}

export const playNext = (state: QueueState, items: readonly QueueTrack[]): QueueState => {
  if (items.length === 0) return state
  if (state.tracks.length === 0 || state.currentIndex < 0) {
    return playItems(state, items, 0)
  }
  const insertAt = state.currentIndex + 1
  const tracks = [
    ...state.tracks.slice(0, insertAt),
    ...items,
    ...state.tracks.slice(insertAt),
  ]
  return {
    ...state,
    tracks,
    shuffleOrder: state.shuffle
      ? shuffledIndices(tracks.length, tracks.length)
      : state.shuffleOrder,
  }
}

export const removeAt = (state: QueueState, index: number): QueueState => {
  if (index < 0 || index >= state.tracks.length) return state
  const tracks = state.tracks.filter((_, i) => i !== index)
  if (tracks.length === 0) return emptyQueue()
  const currentIndex =
    index < state.currentIndex
      ? state.currentIndex - 1
      : index === state.currentIndex
        ? clampIndex(state.currentIndex, tracks.length)
        : state.currentIndex
  return {
    ...state,
    tracks,
    currentIndex,
    shuffleOrder: state.shuffle
      ? shuffledIndices(tracks.length, tracks.length)
      : [],
  }
}

export const moveTrack = (
  state: QueueState,
  from: number,
  to: number,
): QueueState => {
  if (
    from < 0 ||
    to < 0 ||
    from >= state.tracks.length ||
    to >= state.tracks.length ||
    from === to
  ) {
    return state
  }
  const tracks = [...state.tracks]
  const [item] = tracks.splice(from, 1)
  tracks.splice(to, 0, item!)
  const currentIndex =
    state.currentIndex === from
      ? to
      : from < state.currentIndex && to >= state.currentIndex
        ? state.currentIndex - 1
        : from > state.currentIndex && to <= state.currentIndex
          ? state.currentIndex + 1
          : state.currentIndex
  return { ...state, tracks, currentIndex }
}

export const setRepeat = (state: QueueState, repeat: RepeatMode): QueueState => ({
  ...state,
  repeat,
})

export const setShuffle = (state: QueueState, shuffle: boolean): QueueState => ({
  ...state,
  shuffle,
  shuffleOrder: shuffle
    ? shuffledIndices(state.tracks.length, state.tracks.length + state.currentIndex)
    : [],
})

export const skipTo = (state: QueueState, index: number): QueueState => {
  if (state.tracks.length === 0) return state
  return { ...state, currentIndex: clampIndex(index, state.tracks.length) }
}

export const nextIndex = (state: QueueState): number => {
  if (state.tracks.length === 0) return -1
  if (state.repeat === 'one') return state.currentIndex
  if (state.shuffle && state.shuffleOrder.length === state.tracks.length) {
    const pos = state.shuffleOrder.indexOf(state.currentIndex)
    if (pos < 0) return clampIndex(state.currentIndex + 1, state.tracks.length)
    if (pos + 1 < state.shuffleOrder.length) return state.shuffleOrder[pos + 1]!
    return state.repeat === 'all' ? state.shuffleOrder[0]! : -1
  }
  if (state.currentIndex + 1 < state.tracks.length) return state.currentIndex + 1
  return state.repeat === 'all' ? 0 : -1
}

export const previousIndex = (state: QueueState): number => {
  if (state.tracks.length === 0) return -1
  if (state.repeat === 'one') return state.currentIndex
  if (state.shuffle && state.shuffleOrder.length === state.tracks.length) {
    const pos = state.shuffleOrder.indexOf(state.currentIndex)
    if (pos < 0) return clampIndex(state.currentIndex - 1, state.tracks.length)
    if (pos - 1 >= 0) return state.shuffleOrder[pos - 1]!
    return state.repeat === 'all'
      ? state.shuffleOrder[state.shuffleOrder.length - 1]!
      : state.currentIndex
  }
  if (state.currentIndex - 1 >= 0) return state.currentIndex - 1
  return state.repeat === 'all' ? state.tracks.length - 1 : state.currentIndex
}

export const currentTrack = (state: QueueState): QueueTrack | undefined =>
  state.currentIndex >= 0 ? state.tracks[state.currentIndex] : undefined

export const prefetchTargets = (
  state: QueueState,
  count = 2,
): readonly QueueTrack[] => {
  if (state.tracks.length === 0 || state.currentIndex < 0 || count <= 0) {
    return []
  }

  const collect = (
    remaining: number,
    index: number,
    acc: readonly QueueTrack[],
  ): readonly QueueTrack[] => {
    if (remaining <= 0) return acc
    const next = nextIndex({ ...state, currentIndex: index })
    if (next < 0) return acc
    const track = state.tracks[next]
    if (!track) return acc
    if (acc.some((item) => item.id === track.id)) return acc
    return collect(remaining - 1, next, [...acc, track])
  }

  return collect(count, state.currentIndex, [])
}

export const shuffleTracks = <T>(items: readonly T[], seed: number): readonly T[] => {
  const order = shuffledIndices(items.length, seed)
  return order.map((index) => items[index]!)
}
