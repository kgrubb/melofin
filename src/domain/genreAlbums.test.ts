import { describe, expect, it } from 'vitest'
import { mergeAlbumLists, shouldQueryGenreTracksById, uniqueAlbumsFromTracks } from '@/src/domain/genreAlbums'
import type { LibraryItem } from '@/src/domain/libraryItem'

const track = (
  id: string,
  patch: Partial<LibraryItem> = {},
): LibraryItem => ({
  id,
  name: patch.name ?? id,
  type: 'Audio',
  artists: patch.artists ?? ['A'],
  durationMs: 1,
  ...patch,
})

describe('uniqueAlbumsFromTracks', () => {
  it('dedupes by albumId and prefers album titles', () => {
    const albums = uniqueAlbumsFromTracks([
      track('t2', {
        albumId: 'b',
        album: 'Beta',
        artists: ['B'],
        imageTag: 'tb',
        imageItemId: 'b',
      }),
      track('t1', { albumId: 'a', album: 'Alpha', artists: ['A'] }),
      track('t1b', { albumId: 'a', album: 'Alpha (Deluxe)' }),
      track('orphan', { name: 'Loose' }),
    ])
    expect(albums.map((album) => album.id)).toEqual(['a', 'b'])
    expect(albums[0]).toMatchObject({
      id: 'a',
      name: 'Alpha',
      type: 'MusicAlbum',
      artists: ['A'],
    })
    expect(albums[1]?.imageItemId).toBe('b')
    expect(albums[1]?.imageTag).toBe('tb')
  })

  it('does not attach a track image tag to the album id', () => {
    const albums = uniqueAlbumsFromTracks([
      track('t', {
        albumId: 'album',
        album: 'LP',
        imageTag: 'track-tag',
        imageItemId: 't',
      }),
    ])
    expect(albums[0]?.id).toBe('album')
    expect(albums[0]?.imageItemId).toBe('album')
    expect(albums[0]?.imageTag).toBeUndefined()
  })

  it('falls back to the track title when album name is missing', () => {
    const albums = uniqueAlbumsFromTracks([
      track('t', { albumId: 'x', name: 'Song Title', album: '  ' }),
    ])
    expect(albums).toEqual([
      expect.objectContaining({ id: 'x', name: 'Song Title', type: 'MusicAlbum' }),
    ])
  })

  it('unions album lists with preferred rows winning', () => {
    const stub: LibraryItem = {
      id: 'a',
      name: 'Stub',
      type: 'MusicAlbum',
      artists: ['X'],
      durationMs: 0,
    }
    const real: LibraryItem = {
      id: 'a',
      name: 'Real Album',
      type: 'MusicAlbum',
      artists: ['Y'],
      durationMs: 1,
    }
    const extra: LibraryItem = {
      id: 'b',
      name: 'Beta',
      type: 'MusicAlbum',
      artists: ['Z'],
      durationMs: 1,
    }
    expect(mergeAlbumLists([real], [stub, extra]).map((album) => album.id)).toEqual([
      'b',
      'a',
    ])
    expect(mergeAlbumLists([real], [stub, extra])[1]?.name).toBe('Real Album')
  })
})

describe('shouldQueryGenreTracksById', () => {
  it('falls back when a named crawl found no audio', () => {
    expect(shouldQueryGenreTracksById('Hip Hop', 0)).toBe(true)
    expect(shouldQueryGenreTracksById('Hip Hop', undefined)).toBe(true)
    expect(shouldQueryGenreTracksById('Hip Hop', 12)).toBe(false)
    expect(shouldQueryGenreTracksById(undefined, 0)).toBe(false)
    expect(shouldQueryGenreTracksById('  ', 0)).toBe(false)
  })
})
