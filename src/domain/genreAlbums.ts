import type { LibraryItem } from '@/src/domain/libraryItem'

const compareAlbumName = (left: LibraryItem, right: LibraryItem): number =>
  left.name.localeCompare(right.name)

/** Dedupe tracks into albums. Jellyfin often tags genre on Audio only. */
export const uniqueAlbumsFromTracks = (
  tracks: readonly LibraryItem[],
): readonly LibraryItem[] => {
  const albums: LibraryItem[] = []
  const seen = new Set<string>()
  for (const track of tracks) {
    const albumId = track.albumId?.trim()
    if (!albumId || seen.has(albumId)) continue
    seen.add(albumId)
    const name = track.album?.trim() || track.name
    const albumOwnsArt = !track.imageItemId || track.imageItemId === albumId
    albums.push({
      id: albumId,
      name,
      type: 'MusicAlbum',
      artists: track.artists,
      album: name,
      albumId,
      artistId: track.artistId,
      durationMs: 0,
      imageTag: albumOwnsArt ? track.imageTag : undefined,
      imageItemId: albumId,
    })
  }
  return albums.toSorted(compareAlbumName)
}

/** Union album lists. `preferred` wins on id collision (real MusicAlbum DTOs). */
export const mergeAlbumLists = (
  preferred: readonly LibraryItem[],
  extra: readonly LibraryItem[],
): readonly LibraryItem[] => {
  const byId = new Map<string, LibraryItem>()
  for (const album of extra) {
    if (album.id) byId.set(album.id, album)
  }
  for (const album of preferred) {
    if (album.id) byId.set(album.id, album)
  }
  return [...byId.values()].toSorted(compareAlbumName)
}

/** Audio crawls to run — Jellyfin tags some songs by genre name and others by id. */
export const genreTrackQueryModes = (
  genreName?: string,
): readonly ('name' | 'id')[] => {
  const name = genreName?.trim()
  if (!name) return ['id']
  return ['name', 'id']
}
