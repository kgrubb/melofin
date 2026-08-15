import { describe, expect, it } from 'vitest'
import {
  buildLibrarySections,
  CARPLAY_PAGE_SIZE,
  parseCarPlayItemId,
  tracksFromOffline,
} from '@/src/carplay/templates'

const offlineEntry = (id: string, complete = true) => ({
  itemId: id,
  title: id,
  artist: 'A',
  album: 'B',
  durationMs: 1000,
  path: '/x',
  sizeBytes: 1,
  downloadedAt: 1,
  lastAccessedAt: 1,
  kind: 'user' as const,
  complete,
})

describe('carplay templates', () => {
  it('builds sections with albums, paging, and offline play-all', () => {
    const artists = Array.from({ length: CARPLAY_PAGE_SIZE + 2 }, (_, i) => ({
      id: `a${i}`,
      name: `Artist ${i}`,
      type: 'MusicArtist' as const,
      artists: [],
      durationMs: 0,
    }))
    const sections = buildLibrarySections(
      [
        {
          id: 'p1',
          name: 'Picks',
          type: 'Playlist',
          artists: [],
          durationMs: 0,
          childCount: 4,
        },
      ],
      artists,
      [offlineEntry('t1'), offlineEntry('incomplete', false)],
      [
        {
          id: 'al1',
          name: 'Album',
          type: 'MusicAlbum',
          artists: ['Band'],
          durationMs: 0,
        },
      ],
    )
    expect(sections.map((s) => s.title)).toEqual([
      'Playlists',
      'Albums',
      'Artists',
      'Offline',
    ])
    expect(sections[2]?.items).toHaveLength(CARPLAY_PAGE_SIZE + 1)
    expect(sections[2]?.items.at(-1)?.id).toBe(
      `artistsMore:${CARPLAY_PAGE_SIZE}`,
    )
    expect(sections[3]?.items[0]?.id).toBe('offline:all')
    expect(sections[3]?.items).toHaveLength(2)
    expect(tracksFromOffline([offlineEntry('t1'), offlineEntry('x', false)])).toHaveLength(
      1,
    )
  })

  it('pages albums and parses album / albumsMore ids', () => {
    const albums = Array.from({ length: CARPLAY_PAGE_SIZE + 1 }, (_, i) => ({
      id: `al${i}`,
      name: `Album ${i}`,
      type: 'MusicAlbum' as const,
      artists: ['Band'],
      durationMs: 0,
    }))
    const sections = buildLibrarySections([], [], [], albums)
    expect(sections[1]?.items.at(-1)?.id).toBe(`albumsMore:${CARPLAY_PAGE_SIZE}`)
    const paged = buildLibrarySections([], [], [], albums, {
      albumsOffset: CARPLAY_PAGE_SIZE,
    })
    expect(paged[1]?.items).toHaveLength(1)
    expect(parseCarPlayItemId('albumsMore:40')).toEqual({
      kind: 'albumsMore',
      offset: 40,
    })
    expect(parseCarPlayItemId('playlist:p1')).toEqual({
      kind: 'playlist',
      id: 'p1',
    })
    expect(parseCarPlayItemId('album:al1')).toEqual({ kind: 'album', id: 'al1' })
    expect(parseCarPlayItemId('artistsMore:40')).toEqual({
      kind: 'artistsMore',
      offset: 40,
    })
    expect(parseCarPlayItemId('offline:all')).toEqual({ kind: 'offlineAll' })
    expect(parseCarPlayItemId('nope')).toBeNull()
    expect(parseCarPlayItemId('artist:')).toBeNull()
    expect(parseCarPlayItemId('playlist:')).toBeNull()
    expect(parseCarPlayItemId('offline:')).toBeNull()
  })
})
