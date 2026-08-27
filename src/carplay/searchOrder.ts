import type { LibraryItem } from '@/src/services/jellyfin/library'

/** Songs first so Search is find-and-play, then albums, playlists, artists. */
export const orderSearchResults = (
  items: readonly LibraryItem[],
): readonly LibraryItem[] => {
  const rank = (item: LibraryItem) => {
    if (item.type === 'Audio') return 0
    if (item.type === 'MusicAlbum') return 1
    if (item.type === 'Playlist') return 2
    return 3
  }
  return items.toSorted((a, b) => rank(a) - rank(b))
}
