import type { LibraryItem } from '@/src/domain/libraryItem'

export const LISTEN_NOW_TARGET = 50
/** Pad Instant Mix / Home mixes when thinner than this (Spotify-scale queues). */
export const LISTEN_NOW_MIN = 30

export const isListenNowTrack = (item: LibraryItem): boolean =>
  item.type === 'Audio' && item.id.length > 0

/** First Audio resume item, else album/playlist seed for Instant Mix. */
export const listenNowSeed = (
  resume: readonly LibraryItem[],
  albums: readonly LibraryItem[],
  playlists: readonly LibraryItem[],
): LibraryItem | undefined =>
  resume.find(isListenNowTrack) ?? resume[0] ?? albums[0] ?? playlists[0]

/** Dedupe Audio tracks across Instant Mix + fallbacks, cap at `target`. */
export const assembleListenNow = (
  sources: readonly (readonly LibraryItem[])[],
  target = LISTEN_NOW_TARGET,
): readonly LibraryItem[] => {
  const merged: LibraryItem[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    for (const item of source) {
      if (!isListenNowTrack(item) || seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
      if (merged.length >= target) return merged
    }
  }
  return merged
}
