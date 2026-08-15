import type { LibraryItem } from '@/src/domain/libraryItem'

/** Fill empty track artists from album rows or siblings. */
export const backfillSongArtists = (
  songs: readonly LibraryItem[],
  albums: readonly LibraryItem[] = [],
): readonly LibraryItem[] => {
  if (songs.length === 0) return songs
  if (songs.every((song) => song.artists.length > 0)) return songs

  const albumById = new Map<string, LibraryItem>()
  const albumByName = new Map<string, readonly string[]>()
  for (const album of albums) {
    albumById.set(album.id, album)
    if (album.artists.length === 0) continue
    const key = album.name.trim().toLowerCase()
    if (key && !albumByName.has(key)) albumByName.set(key, album.artists)
  }

  const siblingByAlbumId = new Map<string, readonly string[]>()
  const siblingByAlbumName = new Map<string, readonly string[]>()
  for (const song of songs) {
    if (song.artists.length === 0) continue
    if (song.albumId && !siblingByAlbumId.has(song.albumId)) {
      siblingByAlbumId.set(song.albumId, song.artists)
    }
    const key = song.album?.trim().toLowerCase()
    if (key && !siblingByAlbumName.has(key)) siblingByAlbumName.set(key, song.artists)
  }

  const next = songs.map((song) => {
    if (song.artists.length > 0) return song
    const key = song.album?.trim().toLowerCase()
    const album =
      (song.albumId ? albumById.get(song.albumId) : undefined) ??
      (song.imageItemId ? albumById.get(song.imageItemId) : undefined)
    const artists =
      (album && album.artists.length > 0 ? album.artists : undefined) ??
      (key ? albumByName.get(key) : undefined) ??
      (song.albumId ? siblingByAlbumId.get(song.albumId) : undefined) ??
      (song.imageItemId ? siblingByAlbumId.get(song.imageItemId) : undefined) ??
      (key ? siblingByAlbumName.get(key) : undefined)
    if (!artists || artists.length === 0) return song
    return {
      ...song,
      artists,
      albumId: song.albumId ?? album?.id,
      artistId: song.artistId ?? album?.artistId,
    }
  })
  return next.some((song, i) => song !== songs[i]) ? next : songs
}
