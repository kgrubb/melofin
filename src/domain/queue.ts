export type QueueTrack = {
  readonly id: string
  /** Opaque per-queue-instance id (duplicates of the same Jellyfin item stay distinct). */
  readonly queueEntryId?: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly durationMs: number
  readonly artworkUrl?: string
  readonly mediaSourceId?: string
  readonly albumId?: string
  readonly artistId?: string
  readonly isFavorite?: boolean
  readonly hasLyrics?: boolean
  readonly normalizationGain?: number
}

export type RepeatMode = 'off' | 'one' | 'all'

export type QueueState = {
  readonly tracks: readonly QueueTrack[]
  readonly currentIndex: number
  readonly shuffle: boolean
  readonly repeat: RepeatMode
  readonly shuffleOrder: readonly number[]
}

export const newQueueEntryId = (): string =>
  `qe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

export const playingIdentity = (
  track: QueueTrack | undefined | null,
): string | undefined => {
  if (!track) return undefined
  return track.queueEntryId ?? track.id
}

export const withQueueEntryId = (track: QueueTrack): QueueTrack =>
  track.queueEntryId ? track : { ...track, queueEntryId: newQueueEntryId() }

export const ensureQueueEntryIds = (
  items: readonly QueueTrack[],
): readonly QueueTrack[] => items.map(withQueueEntryId)

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

/** In-place Fisher-Yates. O(n) swaps, no per-swap array copies. */
const shuffleInPlace = (indices: number[], seed?: number): void => {
  const random = (n: number): number => {
    if (seed === undefined) return Math.random()
    // Seeded path kept for tests / reproducible helpers only.
    const x = Math.sin(seed + n) * 10000
    return x - Math.floor(x)
  }
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random(i) * (i + 1))
    const tmp = indices[i]!
    indices[i] = indices[j]!
    indices[j] = tmp
  }
}

const shuffledIndices = (length: number, seed?: number): readonly number[] => {
  const indices = Array.from({ length }, (_, i) => i)
  shuffleInPlace(indices, seed)
  return indices
}

/** `pin` first, remaining indices shuffled. O(n), one allocation. */
const shuffleOrderPinning = (length: number, pin: number): readonly number[] => {
  if (length <= 0) return []
  if (pin < 0 || pin >= length) return shuffledIndices(length)
  if (length === 1) return [pin]
  const order = Array.from({ length: length - 1 }, (_, i) => (i < pin ? i : i + 1))
  shuffleInPlace(order)
  order.unshift(pin)
  return order
}

export const playItems = (
  state: QueueState,
  items: readonly QueueTrack[],
  startIndex = 0,
): QueueState => {
  if (items.length === 0) return emptyQueue()
  const tracks = ensureQueueEntryIds(items)
  const currentIndex = clampIndex(startIndex, tracks.length)
  return {
    tracks,
    currentIndex,
    shuffle: state.shuffle,
    repeat: state.repeat,
    shuffleOrder: state.shuffle
      ? shuffleOrderPinning(tracks.length, currentIndex)
      : [],
  }
}

export const enqueue = (state: QueueState, items: readonly QueueTrack[]): QueueState => {
  if (items.length === 0) return state
  const incoming = ensureQueueEntryIds(items)
  const tracks = [...state.tracks, ...incoming]
  const currentIndex = state.currentIndex < 0 ? 0 : state.currentIndex
  if (!state.shuffle) {
    return { ...state, tracks, currentIndex, shuffleOrder: [] }
  }
  // Append into shuffle order. Do not reshuffle mid-session.
  if (state.shuffleOrder.length !== state.tracks.length) {
    return {
      ...state,
      tracks,
      currentIndex,
      shuffleOrder: shuffleOrderPinning(tracks.length, currentIndex),
    }
  }
  const start = state.tracks.length
  const appended = shuffledIndices(incoming.length).map((i) => start + i)
  return {
    ...state,
    tracks,
    currentIndex,
    shuffleOrder: [...state.shuffleOrder, ...appended],
  }
}

export const playNext = (state: QueueState, items: readonly QueueTrack[]): QueueState => {
  if (items.length === 0) return state
  if (state.tracks.length === 0 || state.currentIndex < 0) {
    return playItems(state, items, 0)
  }
  const insertAt = state.currentIndex + 1
  const incoming = ensureQueueEntryIds(items)
  const tracks = [
    ...state.tracks.slice(0, insertAt),
    ...incoming,
    ...state.tracks.slice(insertAt),
  ]
  if (!state.shuffle) {
    return { ...state, tracks, shuffleOrder: [] }
  }
  // Keep the playing track. Splice play-next into shuffle order immediately after it.
  const shift = incoming.length
  const remap = (index: number) => (index < insertAt ? index : index + shift)
  const remapped = state.shuffleOrder.map(remap)
  const inserted = Array.from({ length: shift }, (_, i) => insertAt + i)
  const pos = remapped.indexOf(state.currentIndex)
  const shuffleOrder =
    pos < 0
      ? [...remapped, ...inserted]
      : [...remapped.slice(0, pos + 1), ...inserted, ...remapped.slice(pos + 1)]
  return { ...state, tracks, shuffleOrder }
}

/**
 * Insert into the store array at `insertAt`. Shuffle order places the new
 * tracks after the current item and before any later (higher) store indices.
 */
export const insertTracksAt = (
  state: QueueState,
  items: readonly QueueTrack[],
  insertAt: number,
): QueueState => {
  if (items.length === 0) return state
  if (state.tracks.length === 0 || state.currentIndex < 0) {
    return playItems(state, items, 0)
  }
  const at = Math.max(0, Math.min(insertAt, state.tracks.length))
  const incoming = ensureQueueEntryIds(items)
  const shift = incoming.length
  const tracks = [
    ...state.tracks.slice(0, at),
    ...incoming,
    ...state.tracks.slice(at),
  ]
  const currentIndex =
    at <= state.currentIndex ? state.currentIndex + shift : state.currentIndex
  if (!state.shuffle) {
    return { ...state, tracks, currentIndex, shuffleOrder: [] }
  }
  if (state.shuffleOrder.length !== state.tracks.length) {
    return {
      ...state,
      tracks,
      currentIndex,
      shuffleOrder: shuffleOrderPinning(tracks.length, currentIndex),
    }
  }
  const remapped = state.shuffleOrder.map((index) =>
    index < at ? index : index + shift,
  )
  const inserted = Array.from({ length: shift }, (_, i) => at + i)
  const pos = remapped.indexOf(currentIndex)
  const fromPos = pos < 0 ? 0 : pos + 1
  const found = remapped.findIndex(
    (index, i) => i >= fromPos && index >= at + shift,
  )
  const spliceAt = found < 0 ? remapped.length : found
  return {
    ...state,
    tracks,
    currentIndex,
    shuffleOrder: [
      ...remapped.slice(0, spliceAt),
      ...inserted,
      ...remapped.slice(spliceAt),
    ],
  }
}

const indexAfterMove = (index: number, from: number, to: number): number => {
  if (index === from) return to
  if (from < index && to >= index) return index - 1
  if (from > index && to <= index) return index + 1
  return index
}

const remapShuffleAfterRemove = (
  order: readonly number[],
  removed: number,
): readonly number[] =>
  order.filter((i) => i !== removed).map((i) => (i > removed ? i - 1 : i))

export const removeAt = (state: QueueState, index: number): QueueState => {
  if (index < 0 || index >= state.tracks.length) return state
  const removed = state.tracks[index]
  if (!removed) return state

  const preferredKey =
    index === state.currentIndex &&
    state.shuffle &&
    state.shuffleOrder.length === state.tracks.length
      ? (() => {
          const advance = {
            ...state,
            repeat: state.repeat === 'one' ? ('off' as const) : state.repeat,
          }
          const nxt = nextIndex(advance)
          return nxt >= 0 && nxt !== state.currentIndex
            ? playingIdentity(state.tracks[nxt])
            : undefined
        })()
      : undefined

  const tracks = state.tracks.filter((_, i) => i !== index)
  if (tracks.length === 0) return emptyQueue()
  const currentIndex = preferredKey
    ? (() => {
        const found = tracks.findIndex((t) => playingIdentity(t) === preferredKey)
        return found >= 0 ? found : clampIndex(index, tracks.length)
      })()
    : index < state.currentIndex
      ? state.currentIndex - 1
      : index === state.currentIndex
        ? clampIndex(state.currentIndex, tracks.length)
        : state.currentIndex
  return {
    ...state,
    tracks,
    currentIndex,
    shuffleOrder: state.shuffle
      ? state.shuffleOrder.length === state.tracks.length
        ? remapShuffleAfterRemove(state.shuffleOrder, index)
        : shuffleOrderPinning(tracks.length, currentIndex)
      : [],
  }
}

/** Immutable list move used by queue reorder (UI path, not audio hot path). */
const moveItem = <T>(items: readonly T[], from: number, to: number): readonly T[] => {
  if (from === to) return items
  const without = [...items.slice(0, from), ...items.slice(from + 1)]
  return [...without.slice(0, to), items[from]!, ...without.slice(to)]
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
  const tracks = moveItem(state.tracks, from, to)
  const currentIndex =
    state.currentIndex === from
      ? to
      : from < state.currentIndex && to >= state.currentIndex
        ? state.currentIndex - 1
        : from > state.currentIndex && to <= state.currentIndex
          ? state.currentIndex + 1
          : state.currentIndex
  return {
    ...state,
    tracks,
    currentIndex,
    shuffleOrder: state.shuffle
      ? state.shuffleOrder.length === state.tracks.length
        ? state.shuffleOrder.map((i) => indexAfterMove(i, from, to))
        : shuffleOrderPinning(tracks.length, currentIndex)
      : [],
  }
}

/** Remap a store index after a linear (non-shuffle) view move. */
export const storeIndexAfterViewMove = (
  index: number,
  fromView: number,
  toView: number,
): number => indexAfterMove(index, fromView, toView)

/** Store indices in Queue screen order: now playing, then upcoming. */
export const queueViewIndices = (state: QueueState): readonly number[] => {
  if (state.tracks.length === 0 || state.currentIndex < 0) {
    return state.tracks.map((_, i) => i)
  }
  if (state.shuffle && state.shuffleOrder.length === state.tracks.length) {
    const pos = state.shuffleOrder.indexOf(state.currentIndex)
    if (pos < 0) return state.tracks.map((_, i) => i)
    return state.shuffleOrder
      .slice(pos)
      .filter((index) => index >= 0 && index < state.tracks.length)
  }
  return state.tracks.map((_, i) => i).slice(state.currentIndex)
}

/** Queue screen order: shuffle shows play order from the current track forward. */
export const queueViewTracks = (state: QueueState): readonly QueueTrack[] =>
  queueViewIndices(state)
    .map((index) => state.tracks[index])
    .filter((track): track is QueueTrack => track != null)

/**
 * Reorder the queue as shown on the Queue screen.
 * The playing row stays first. Only upcoming rows move.
 */
export const moveQueueViewTrack = (
  state: QueueState,
  fromView: number,
  toView: number,
): QueueState => {
  if (fromView === toView) return state
  const view = queueViewIndices(state)
  if (
    fromView < 0 ||
    toView < 0 ||
    fromView >= view.length ||
    toView >= view.length ||
    fromView === 0 ||
    toView === 0
  ) {
    return state
  }
  if (state.shuffle && state.shuffleOrder.length === state.tracks.length) {
    const pos = state.shuffleOrder.indexOf(state.currentIndex)
    if (pos < 0) return state
    const fromStore = view[fromView]
    const toStore = view[toView]
    if (fromStore == null || toStore == null) return state
    const remaining = [...state.shuffleOrder.slice(pos)]
    const fromPos = remaining.indexOf(fromStore)
    const toPos = remaining.indexOf(toStore)
    if (fromPos < 0 || toPos < 0 || fromPos === toPos) return state
    return {
      ...state,
      shuffleOrder: [
        ...state.shuffleOrder.slice(0, pos),
        ...moveItem(remaining, fromPos, toPos),
      ],
    }
  }
  return moveTrack(state, view[fromView]!, view[toView]!)
}

/**
 * Play a Queue-screen row. Shuffle keeps the other upcoming tracks;
 * skipTo would hide anything still before the tapped index.
 */
export const playQueueViewIndex = (
  state: QueueState,
  viewIndex: number,
): QueueState => {
  const view = queueViewIndices(state)
  const storeIndex = view[viewIndex]
  if (storeIndex == null) return state
  if (
    viewIndex > 0 &&
    state.shuffle &&
    state.shuffleOrder.length === state.tracks.length
  ) {
    const pos = state.shuffleOrder.indexOf(state.currentIndex)
    if (pos < 0) return skipTo(state, storeIndex)
    const remaining = state.shuffleOrder.slice(pos)
    const oldCurrent = remaining[0]
    const tapped = storeIndex
    if (oldCurrent == null) return skipTo(state, storeIndex)
    const others = remaining.filter((index, i) => i !== 0 && index !== tapped)
    return {
      ...state,
      currentIndex: tapped,
      shuffleOrder: [
        ...state.shuffleOrder.slice(0, pos),
        oldCurrent,
        tapped,
        ...others,
      ],
    }
  }
  return skipTo(state, storeIndex)
}

/** Drop every track after the current play position. Keep playback on the current item. */
export const clearUpcoming = (state: QueueState): QueueState => {
  if (state.tracks.length === 0 || state.currentIndex < 0) return state
  if (state.shuffle && state.shuffleOrder.length === state.tracks.length) {
    const pos = state.shuffleOrder.indexOf(state.currentIndex)
    if (pos < 0 || pos >= state.shuffleOrder.length - 1) return state
    const keep = state.shuffleOrder.slice(0, pos + 1)
    const tracks = keep.map((i) => state.tracks[i]!)
    return {
      ...state,
      tracks,
      currentIndex: tracks.length - 1,
      shuffleOrder: tracks.map((_, i) => i),
    }
  }
  if (state.currentIndex >= state.tracks.length - 1) return state
  const tracks = state.tracks.slice(0, state.currentIndex + 1)
  return {
    ...state,
    tracks,
    shuffleOrder: [],
  }
}

export const upcomingCount = (state: QueueState): number => {
  if (state.tracks.length === 0 || state.currentIndex < 0) return 0
  if (state.shuffle && state.shuffleOrder.length === state.tracks.length) {
    if (state.shuffleOrder.indexOf(state.currentIndex) < 0) return 0
  }
  return Math.max(0, queueViewIndices(state).length - 1)
}

export const patchTrackFavorite = (
  state: QueueState,
  itemId: string,
  isFavorite: boolean,
): QueueState => ({
  ...state,
  tracks: state.tracks.map((track) =>
    track.id === itemId ? { ...track, isFavorite } : track,
  ),
})

export const setRepeat = (state: QueueState, repeat: RepeatMode): QueueState => ({
  ...state,
  repeat,
})

export const setShuffle = (state: QueueState, shuffle: boolean): QueueState => ({
  ...state,
  shuffle,
  shuffleOrder: shuffle
    ? shuffleOrderPinning(
        state.tracks.length,
        clampIndex(state.currentIndex, state.tracks.length),
      )
    : [],
})

/**
 * Grow/replace the queue while keeping the playing track. When shuffle is on,
 * extend the existing order instead of reshuffling mid-playback.
 */
export const expandTracksPreservingPlayback = (
  state: QueueState,
  items: readonly QueueTrack[],
): QueueState => {
  if (items.length === 0) return state
  const ensured = ensureQueueEntryIds(items)
  const current = state.tracks[state.currentIndex]
  const currentKey = playingIdentity(current)
  const byEntry =
    currentKey !== undefined
      ? ensured.findIndex((track) => playingIdentity(track) === currentKey)
      : -1
  // Seed->catalog expand assigns new entry ids. Fall back to media id.
  const foundByMedia =
    byEntry >= 0
      ? byEntry
      : current
        ? ensured.findIndex((track) => track.id === current.id)
        : -1
  if (foundByMedia < 0) return state
  // Keep the playing row's identity so expand cannot remint a PlaySession.
  const tracks =
    byEntry < 0 && current?.queueEntryId
      ? (() => {
          const slot = ensured[foundByMedia]!
          return slot.queueEntryId !== current.queueEntryId
            ? ensured.map((track, index) =>
                index === foundByMedia
                  ? { ...track, queueEntryId: current.queueEntryId }
                  : track,
              )
            : ensured
        })()
      : ensured

  if (!state.shuffle) {
    return {
      ...state,
      tracks,
      currentIndex: foundByMedia,
      shuffleOrder: [],
    }
  }

  const prevLen = state.tracks.length
  if (tracks.length >= prevLen && state.shuffleOrder.length === prevLen && prevLen > 0) {
    const used = new Set<number>()
    const kept: number[] = []
    for (const index of state.shuffleOrder) {
      const next = index === state.currentIndex ? foundByMedia : index
      if (used.has(next)) continue
      used.add(next)
      kept.push(next)
    }
    const missing = Array.from({ length: tracks.length }, (_, i) => i).filter(
      (i) => !used.has(i),
    )
    const appended = shuffledIndices(missing.length).map((i) => missing[i]!)
    return {
      ...state,
      tracks,
      currentIndex: foundByMedia,
      shuffleOrder: [...kept, ...appended],
    }
  }

  return {
    ...state,
    tracks,
    currentIndex: foundByMedia,
    shuffleOrder: shuffleOrderPinning(tracks.length, foundByMedia),
  }
}

/** Resolve a media id to a queue index, preferring the next play-order match (duplicates). */
export const indexOfMediaIdInPlayOrder = (
  state: QueueState,
  itemId: string,
): number => {
  if (!itemId || state.tracks.length === 0) return -1
  const advance =
    state.repeat === 'one' ? { ...state, repeat: 'off' as const } : state
  const nxt = nextIndex(advance)
  if (nxt >= 0 && state.tracks[nxt]?.id === itemId) return nxt

  if (state.shuffle && state.shuffleOrder.length === state.tracks.length) {
    const pos = state.shuffleOrder.indexOf(state.currentIndex)
    const order =
      pos < 0
        ? state.shuffleOrder
        : [
            ...state.shuffleOrder.slice(pos + 1),
            ...state.shuffleOrder.slice(0, pos + 1),
          ]
    for (const index of order) {
      if (state.tracks[index]?.id === itemId) return index
    }
    return -1
  }

  const forward = state.tracks.findIndex(
    (track, i) => i > state.currentIndex && track.id === itemId,
  )
  if (forward >= 0) return forward
  return state.tracks.findIndex(
    (track, i) => i <= state.currentIndex && track.id === itemId,
  )
}

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

/** Optional seed is for tests only. Omit for a fresh random order. */
export const shuffleTracks = <T>(
  items: readonly T[],
  seed?: number,
): readonly T[] => {
  const order = shuffledIndices(items.length, seed)
  return order.map((index) => items[index]!)
}
