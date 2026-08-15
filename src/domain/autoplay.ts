import {
  assembleListenNow,
  isListenNowTrack,
  LISTEN_NOW_MIN,
  LISTEN_NOW_TARGET,
} from '@/src/domain/listenNow'
import type { LibraryItem } from '@/src/domain/libraryItem'
import type { QueueState, QueueTrack, RepeatMode } from '@/src/domain/queue'

export const AUTOPLAY_TARGET = LISTEN_NOW_TARGET
export const AUTOPLAY_MIN = LISTEN_NOW_MIN
/** Refill when fewer than this many tracks remain ahead. */
export const AUTOPLAY_REFILL_AT = 5
export const AUTOPLAY_RECENT_CAP = 64

export type AutoplaySeedInput = {
  readonly queueSourceId: string | undefined
  readonly currentTrackId: string | undefined
  readonly autoplayActive: boolean
  readonly recentTrackIds?: readonly string[]
}

export const shouldRefillAutoplay = (input: {
  readonly autoplayOn: boolean
  readonly repeat: RepeatMode
  readonly upcomingCount: number
  readonly inFlight: boolean
}): boolean => {
  if (!input.autoplayOn || input.repeat !== 'off' || input.inFlight) return false
  return input.upcomingCount < AUTOPLAY_REFILL_AT
}

/** First batch prefers collection seed; later batches drift to current/recent. */
export const autoplaySeedId = (input: AutoplaySeedInput): string | undefined => {
  if (!input.autoplayActive) {
    const source = input.queueSourceId?.trim()
    if (source) return source
    const current = input.currentTrackId?.trim()
    if (current) return current
    return undefined
  }
  const current = input.currentTrackId?.trim()
  if (current) return current
  const recent = input.recentTrackIds
  if (!recent || recent.length === 0) return undefined
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const id = recent[i]?.trim()
    if (id) return id
  }
  return undefined
}

export const filterAutoplayTracks = (
  candidates: readonly LibraryItem[],
  excludeIds: ReadonlySet<string>,
  target = AUTOPLAY_TARGET,
): readonly LibraryItem[] => {
  const out: LibraryItem[] = []
  const seen = new Set<string>()
  for (const item of candidates) {
    if (!isListenNowTrack(item)) continue
    if (excludeIds.has(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
    if (out.length >= target) break
  }
  return out
}

export const assembleAutoplayBatch = (
  sources: readonly (readonly LibraryItem[])[],
  excludeIds: ReadonlySet<string>,
  target = AUTOPLAY_TARGET,
): readonly LibraryItem[] =>
  filterAutoplayTracks(assembleListenNow(sources, target), excludeIds, target)

export const pushRecentPlayedId = (
  recent: readonly string[],
  trackId: string | undefined,
  cap = AUTOPLAY_RECENT_CAP,
): readonly string[] => {
  const id = trackId?.trim()
  if (!id) return recent
  const without = recent.filter((entry) => entry !== id)
  const next = [...without, id]
  if (next.length <= cap) return next
  return next.slice(next.length - cap)
}

/** Index to truncate from when turning Autoplay off (keep current track). */
export const autoplayStripFromIndex = (
  anchorIndex: number | null,
  currentIndex: number,
  trackCount: number,
): number | null => {
  if (anchorIndex == null || anchorIndex < 0 || anchorIndex >= trackCount) {
    return null
  }
  if (currentIndex < anchorIndex) return anchorIndex
  const afterCurrent = currentIndex + 1
  return afterCurrent < trackCount ? afterCurrent : null
}

/** Drop Recommended tracks (store index ≥ anchor); keep the playing row. */
export const stripAutoplayTracks = (
  state: QueueState,
  anchorIndex: number | null,
): QueueState => {
  if (
    anchorIndex == null ||
    anchorIndex < 0 ||
    anchorIndex >= state.tracks.length
  ) {
    return state
  }
  const keep = (index: number) =>
    index < anchorIndex || index === state.currentIndex
  if (state.tracks.every((_, index) => keep(index))) return state
  const indexMap: number[] = []
  const tracks: QueueTrack[] = []
  for (let i = 0; i < state.tracks.length; i += 1) {
    if (!keep(i)) continue
    indexMap[i] = tracks.length
    tracks.push(state.tracks[i]!)
  }
  const currentIndex = indexMap[state.currentIndex] ?? 0
  const shuffleOrder = state.shuffle
    ? state.shuffleOrder
        .map((index) => indexMap[index])
        .filter((index): index is number => index != null)
    : []
  return { ...state, tracks, currentIndex, shuffleOrder }
}

export const excludeIdsForAutoplay = (
  tracks: readonly QueueTrack[],
  recentTrackIds: readonly string[],
): ReadonlySet<string> => {
  const ids = new Set<string>()
  for (const track of tracks) {
    if (track.id) ids.add(track.id)
  }
  for (const id of recentTrackIds) {
    if (id) ids.add(id)
  }
  return ids
}
