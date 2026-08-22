import { describe, expect, it } from 'vitest'
import {
  buildAlbumItems,
  buildArtistDetailItems,
  buildArtistItems,
  buildLibraryRootItems,
  buildOfflineItems,
  buildPlaylistItems,
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
  it('builds library root with downloads when offline tracks exist', () => {
    const root = buildLibraryRootItems([
      offlineEntry('t1'),
      offlineEntry('incomplete', false),
    ])
    expect(root.map((item) => item.id)).toEqual([
      'browse:playlists',
      'browse:albums',
      'browse:artists',
      'browse:offline',
    ])
    expect(root.at(-1)?.detailText).toBe('1 song')
  })

  it('omits downloads row when nothing is downloaded', () => {
    const root = buildLibraryRootItems([
      offlineEntry('incomplete', false),
    ])
    expect(root.map((item) => item.id)).toEqual([
      'browse:playlists',
      'browse:albums',
      'browse:artists',
    ])
  })

  it('pages artists and builds offline play-all', () => {
    const artists = Array.from({ length: CARPLAY_PAGE_SIZE + 2 }, (_, i) => ({
      id: `a${i}`,
      name: `Artist ${i}`,
      type: 'MusicArtist' as const,
      artists: [],
      durationMs: 0,
    }))
    expect(buildArtistItems(artists)).toHaveLength(CARPLAY_PAGE_SIZE + 1)
    expect(buildArtistItems(artists).at(-1)?.id).toBe(
      `artistsMore:${CARPLAY_PAGE_SIZE}`,
    )
    const offline = buildOfflineItems([
      offlineEntry('t1'),
      offlineEntry('incomplete', false),
    ])
    expect(offline[0]?.id).toBe('offline:all')
    expect(offline).toHaveLength(2)
    expect(tracksFromOffline([offlineEntry('t1'), offlineEntry('x', false)])).toHaveLength(
      1,
    )
  })

  it('pages albums and parses browse / artist ids', () => {
    const albums = Array.from({ length: CARPLAY_PAGE_SIZE + 1 }, (_, i) => ({
      id: `al${i}`,
      name: `Album ${i}`,
      type: 'MusicAlbum' as const,
      artists: ['Band'],
      durationMs: 0,
    }))
    expect(buildAlbumItems(albums).at(-1)?.id).toBe(
      `albumsMore:${CARPLAY_PAGE_SIZE}`,
    )
    expect(buildAlbumItems(albums, CARPLAY_PAGE_SIZE)).toHaveLength(1)
    expect(parseCarPlayItemId('browse:albums')).toEqual({
      kind: 'browse',
      section: 'albums',
    })
    expect(parseCarPlayItemId('artistPlay:a1')).toEqual({
      kind: 'artistPlay',
      id: 'a1',
    })
    expect(parseCarPlayItemId('artistAlbumsMore:a1@40')).toEqual({
      kind: 'artistAlbumsMore',
      artistId: 'a1',
      offset: 40,
    })
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

  it('builds artist detail with play row and albums', () => {
    const detail = buildArtistDetailItems('a1', 'Artist One', [
      {
        id: 'al1',
        name: 'Album',
        type: 'MusicAlbum',
        artists: ['Artist One'],
        durationMs: 0,
      },
    ])
    expect(detail[0]).toEqual({
      id: 'artistPlay:a1',
      text: 'Play artist',
      detailText: 'Artist One',
    })
    expect(detail[1]?.id).toBe('album:al1')
  })

  it('pages playlists', () => {
    const playlists = Array.from({ length: CARPLAY_PAGE_SIZE + 1 }, (_, i) => ({
      id: `p${i}`,
      name: `Playlist ${i}`,
      type: 'Playlist' as const,
      artists: [],
      durationMs: 0,
    }))
    expect(buildPlaylistItems(playlists).at(-1)?.id).toBe(
      `playlistsMore:${CARPLAY_PAGE_SIZE}`,
    )
    expect(parseCarPlayItemId('playlistsMore:40')).toEqual({
      kind: 'playlistsMore',
      offset: 40,
    })
  })

  it('formats playlist rows with track counts', () => {
    const rows = buildPlaylistItems([
      {
        id: 'p1',
        name: 'Picks',
        type: 'Playlist',
        artists: [],
        durationMs: 0,
        childCount: 4,
      },
    ])
    expect(rows[0]?.detailText).toBe('4 songs')
  })
})
