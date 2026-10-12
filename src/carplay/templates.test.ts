import 'intl-pluralrules'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n from 'i18next'
import ICU from 'i18next-icu'
import en from '@/src/i18n/locales/en/common.json'
import { carplay } from '@/src/i18n/carplayCopy'
import {
  buildAlbumItems,
  buildArtistDetailItems,
  buildArtistItems,
  buildGenreItems,
  buildHomeSections,
  buildLibraryHubItems,
  buildLibraryHubSections,
  buildOfflineItems,
  buildPlaylistItems,
  buildQueueItems,
  buildSearchExploreSections,
  buildSongItems,
  buildTrackListItems,
  CARPLAY_DEFAULT_MAX_ITEMS,
  CARPLAY_PAGE_SIZE,
  parseCarPlayItemId,
  patchCarPlayPlayingIndicators,
  tracksFromOffline,
  trimSectionsToBudget,
  type CarPlayListItem,
  type CarPlaySection,
} from '@/src/carplay/templates'

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(ICU).init({
      resources: { en: { common: en } },
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      interpolation: { escapeValue: false },
    })
  } else {
    await i18n.changeLanguage('en')
  }
})

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

const album = (id: string, name = id) => ({
  id,
  name,
  type: 'MusicAlbum' as const,
  artists: ['Band'],
  durationMs: 0,
})

describe('carplay templates', () => {
  it('builds library hub sections with recent albums then browse', () => {
    const sections = buildLibraryHubSections({
      recentAlbums: [album('al1', 'New')],
      downloadCount: 1,
      artFor: (item) => `art:${item.id}`,
    })
    expect(sections[0]?.header).toBe(carplay.latestAlbums())
    expect(sections[0]?.items[0]?.artworkUri).toBe('art:al1')
    expect(sections[1]?.header).toBeUndefined()
    expect(sections[1]?.items.map((item) => item.id)).toEqual([
      'browse:playlists',
      'browse:albums',
      'browse:artists',
      'browse:songs',
      'browse:genres',
      'browse:mixes',
      'browse:offline',
    ])
  })

  it('keeps full library browse when maxItems is tight', () => {
    const albums = [album('a1', 'A'), album('a2', 'B'), album('a3', 'C'), album('a4', 'D')]
    const sections = buildLibraryHubSections(
      { recentAlbums: albums, downloadCount: 1 },
      8,
    )
    expect(sections[0]?.items).toHaveLength(1)
    expect(sections[1]?.items.map((item) => item.id)).toEqual([
      'browse:playlists',
      'browse:albums',
      'browse:artists',
      'browse:songs',
      'browse:genres',
      'browse:mixes',
      'browse:offline',
    ])
  })

  it('omits latest albums from library hub when budget only fits browse', () => {
    const sections = buildLibraryHubSections(
      { recentAlbums: [album('a1', 'A')], downloadCount: 1 },
      7,
    )
    expect(sections).toHaveLength(1)
    expect(sections[0]?.items).toHaveLength(7)
  })

  it('builds library hub without shuffle/search rows', () => {
    const hub = buildLibraryHubItems([
      offlineEntry('t1'),
      offlineEntry('incomplete', false),
    ])
    expect(hub.map((item: CarPlayListItem) => item.id)).toEqual([
      'browse:playlists',
      'browse:albums',
      'browse:artists',
      'browse:songs',
      'browse:genres',
      'browse:mixes',
      'browse:offline',
    ])
    expect(hub.at(-1)?.detailText).toBe(carplay.songCount(1))
  })

  it('omits downloads from hub when nothing is downloaded', () => {
    const hub = buildLibraryHubItems([offlineEntry('incomplete', false)])
    expect(hub.map((item: CarPlayListItem) => item.id)).toEqual([
      'browse:playlists',
      'browse:albums',
      'browse:artists',
      'browse:songs',
      'browse:genres',
      'browse:mixes',
    ])
  })

  it('builds home sections with shuffle actions first', () => {
    const sections = buildHomeSections({
      downloadCount: 2,
      recent: [album('al1', 'Recent')],
      favoriteTracks: [
        {
          id: 't1',
          name: 'Fav',
          type: 'Audio',
          artists: ['A'],
          durationMs: 1,
          isFavorite: true,
          albumId: 'al1',
        },
      ],
    })
    expect(sections[0]?.items.map((item) => item.id)).toEqual([
      'action:shuffleAll',
      'action:shuffleFavorites',
      'action:shuffleDownloads',
    ])
    expect(
      sections.some((section) => section.header === carplay.recentlyPlayed()),
    ).toBe(true)
  })

  it('trims sections to budget counting image rows as 1', () => {
    const sections: readonly CarPlaySection[] = [
      {
        items: [
          { id: 'a', text: 'A' },
          {
            id: 'img',
            text: 'Rail',
            imageRowUris: ['u1', 'u2', 'u3'],
          },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
        ],
      },
      {
        header: 'More',
        items: [
          { id: 'd', text: 'D' },
          { id: 'e', text: 'E' },
        ],
      },
    ]
    const trimmed = trimSectionsToBudget(sections, 3)
    expect(trimmed).toHaveLength(1)
    expect(trimmed[0]?.items).toHaveLength(3)
    expect(trimmed[0]?.items[1]?.imageRowUris).toHaveLength(3)
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
    expect(
      tracksFromOffline([offlineEntry('t1'), offlineEntry('x', false)]),
    ).toHaveLength(1)
  })

  it('parses expanded action ids', () => {
    expect(parseCarPlayItemId('browse:albums')).toEqual({
      kind: 'browse',
      section: 'albums',
    })
    expect(parseCarPlayItemId('browse:songs')).toEqual({
      kind: 'browse',
      section: 'songs',
    })
    expect(parseCarPlayItemId('play:artist:a1')).toEqual({
      kind: 'play',
      type: 'artist',
      id: 'a1',
    })
    expect(parseCarPlayItemId('shuffle:album:al1')).toEqual({
      kind: 'shuffle',
      type: 'album',
      id: 'al1',
    })
    expect(parseCarPlayItemId('trackAt:3')).toEqual({
      kind: 'trackAt',
      index: 3,
    })
    expect(parseCarPlayItemId('queue:2')).toEqual({ kind: 'queue', index: 2 })
    expect(parseCarPlayItemId('genre:id:g1')).toEqual({ kind: 'genre', id: 'g1' })
    expect(parseCarPlayItemId('genre:name:Rock')).toEqual({
      kind: 'genreName',
      name: 'Rock',
    })
    expect(parseCarPlayItemId('mix:m1')).toEqual({ kind: 'mix', id: 'm1' })
    expect(parseCarPlayItemId('song:s1')).toEqual({ kind: 'song', id: 's1' })
    expect(parseCarPlayItemId('artistAlbumsMore:a1@40')).toEqual({
      kind: 'artistAlbumsMore',
      artistId: 'a1',
      offset: 40,
    })
    expect(parseCarPlayItemId('songsMore:40')).toEqual({
      kind: 'songsMore',
      offset: 40,
    })
    expect(parseCarPlayItemId('offline:all')).toEqual({ kind: 'offlineAll' })
    expect(parseCarPlayItemId('action:shuffleAll')).toEqual({
      kind: 'shuffleAll',
    })
    expect(parseCarPlayItemId('action:shuffleFavorites')).toEqual({
      kind: 'shuffleFavorites',
    })
    expect(parseCarPlayItemId('action:search')).toEqual({ kind: 'search' })
    expect(parseCarPlayItemId('nope')).toBeNull()
    expect(parseCarPlayItemId('artist:')).toBeNull()
  })

  it('builds artist detail with play/shuffle and albums', () => {
    const detail = buildArtistDetailItems('a1', 'Artist One', [
      {
        id: 'al1',
        name: 'Album',
        type: 'MusicAlbum',
        artists: ['Artist One'],
        durationMs: 0,
      },
    ])
    expect(detail[0]?.id).toBe('play:artist:a1')
    expect(detail[1]?.id).toBe('shuffle:artist:a1')
    expect(detail[2]?.id).toBe('album:al1')
  })

  it('builds track lists with play/shuffle headers', () => {
    const rows = buildTrackListItems('album', 'al1', [
      {
        id: 't1',
        name: 'Song',
        type: 'Audio',
        artists: ['A'],
        durationMs: 1000,
      },
    ])
    expect(rows[0]?.id).toBe('play:album:al1')
    expect(rows[1]?.id).toBe('shuffle:album:al1')
    expect(rows[2]?.id).toBe('trackAt:0')
  })

  it('pages playlists and albums', () => {
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
    expect(buildAlbumItems([album('al1')])[0]?.detailText).toBe('Band')
    expect(CARPLAY_DEFAULT_MAX_ITEMS).toBe(12)
  })

  it('builds search explore with search affordance', () => {
    const sections = buildSearchExploreSections({
      genres: [
        {
          id: 'g1',
          name: 'Rock',
          type: 'Genre',
          artists: [],
          durationMs: 0,
        },
      ],
    })
    expect(sections[0]?.items[0]?.id).toBe('action:search')
    expect(sections.some((section) => section.header === carplay.genres())).toBe(
      true,
    )
  })

  it('trims to empty when budget is zero and skips empty sections', () => {
    expect(trimSectionsToBudget([{ items: [{ id: 'a', text: 'A' }] }], 0)).toEqual(
      [],
    )
    expect(trimSectionsToBudget([{ items: [] }, { items: [{ id: 'a', text: 'A' }] }], 1)).toEqual([
      { items: [{ id: 'a', text: 'A' }] },
    ])
  })

  it('parses invalid and edge action ids', () => {
    expect(parseCarPlayItemId('browse:nope')).toBeNull()
    expect(parseCarPlayItemId('play:track:x')).toBeNull()
    expect(parseCarPlayItemId('play:')).toBeNull()
    expect(parseCarPlayItemId('shuffle:album:')).toBeNull()
    expect(parseCarPlayItemId('trackAt:x')).toBeNull()
    expect(parseCarPlayItemId('queue:NaN')).toBeNull()
    expect(parseCarPlayItemId('genre:id:')).toBeNull()
    expect(parseCarPlayItemId('genre:name:')).toBeNull()
    expect(parseCarPlayItemId('genre:g1')).toEqual({ kind: 'genre', id: 'g1' })
    expect(parseCarPlayItemId('mix:')).toBeNull()
    expect(parseCarPlayItemId('artistAlbumsMore:@40')).toBeNull()
    expect(parseCarPlayItemId('artistAlbumsMore:a1@x')).toBeNull()
    expect(parseCarPlayItemId('genresMore:8')).toEqual({
      kind: 'genresMore',
      offset: 8,
    })
    expect(parseCarPlayItemId('tracksMore:40')).toEqual({
      kind: 'tracksMore',
      offset: 40,
    })
    expect(parseCarPlayItemId('action:shuffleDownloads')).toEqual({
      kind: 'shuffleDownloads',
    })
    expect(parseCarPlayItemId('artistsMore:notanumber')).toBeNull()
  })

  it('builds full home rails including resume mixes favorites albums playlists', () => {
    const sections = buildHomeSections({
      resume: [
        {
          id: 'r1',
          name: 'Resume Song',
          type: 'Audio',
          artists: ['A'],
          durationMs: 1,
          albumId: 'al1',
        },
        {
          id: 'r2',
          name: 'Resume Artist',
          type: 'MusicArtist',
          artists: [],
          durationMs: 0,
        },
        {
          id: 'r3',
          name: 'Resume Playlist',
          type: 'Playlist',
          artists: [],
          durationMs: 0,
          childCount: 2,
        },
        album('r4', 'Resume Album'),
      ],
      mixes: [
        {
          id: 'm1',
          title: 'Mix One',
          subtitle: 'A · B',
          artworkUris: ['u1', 'u2'],
        },
        { id: 'm2', title: 'Mix Two' },
      ],
      favoriteArtists: [
        {
          id: 'fa1',
          name: 'Fav Artist',
          type: 'MusicArtist',
          artists: [],
          durationMs: 0,
        },
      ],
      favoriteTracks: [
        {
          id: 'ft1',
          name: 'Fav Track',
          type: 'Audio',
          artists: ['A'],
          durationMs: 1,
          albumId: 'al9',
        },
        {
          id: 'ft2',
          name: 'Fav No Album',
          type: 'Audio',
          artists: ['B'],
          durationMs: 1,
        },
      ],
      latestAlbums: [album('la1', 'Latest')],
      playlists: [
        {
          id: 'p1',
          name: 'Picks',
          type: 'Playlist',
          artists: [],
          durationMs: 0,
          childCount: 3,
        },
      ],
      playingId: 'r1',
      downloadCount: 0,
    }, 40)
    expect(sections.some((s) => s.header === carplay.continueListening())).toBe(true)
    expect(sections.some((s) => s.header === carplay.yourMixes())).toBe(true)
    expect(sections.some((s) => s.header === carplay.favoriteArtists())).toBe(true)
    expect(sections.some((s) => s.header === carplay.favoriteTracks())).toBe(true)
    expect(sections.some((s) => s.header === carplay.latestAlbums())).toBe(true)
    expect(sections.some((s) => s.header === carplay.playlists())).toBe(true)
    const mixes = sections.find((s) => s.header === carplay.yourMixes())
    expect(mixes?.items).toHaveLength(2)
    expect(mixes?.items[0]?.imageRowUris).toEqual(['u1', 'u2'])
    expect(mixes?.items[0]?.id).toBe('mix:m1')
    expect(mixes?.items[1]?.id).toBe('mix:m2')
  })

  it('builds home mix rail without image row when art missing', () => {
    const sections = buildHomeSections({
      mixes: [{ id: 'm1', title: 'Bare Mix' }],
    })
    const mixes = sections.find((s) => s.header === carplay.yourMixes())
    expect(mixes?.items.every((item) => !item.imageRowUris)).toBe(true)
    expect(mixes?.items[0]?.showsDisclosureIndicator).toBe(true)
  })

  it('attaches artwork uris on home media rows when artFor is provided', () => {
    const sections = buildHomeSections(
      {
        latestAlbums: [album('la1', 'Latest')],
        favoriteTracks: [
          {
            id: 'ft1',
            name: 'Fav',
            type: 'Audio',
            artists: ['A'],
            durationMs: 1,
            imageTag: 't',
          },
        ],
        artFor: (item) => `thumb:${item.id}`,
      },
      40,
    )
    const albums = sections.find((s) => s.header === carplay.latestAlbums())
    const tracks = sections.find((s) => s.header === carplay.favoriteTracks())
    expect(albums?.items[0]?.artworkUri).toBe('thumb:la1')
    expect(tracks?.items[0]?.artworkUri).toBe('thumb:ft1')
  })

  it('builds search explore mixes and playlists', () => {
    const sections = buildSearchExploreSections({
      mixes: [{ id: 'm1', title: 'Mix', subtitle: 'Sub' }],
      playlists: [
        {
          id: 'p1',
          name: 'P',
          type: 'Playlist',
          artists: [],
          durationMs: 0,
          childCount: 1,
        },
      ],
      genres: [
        {
          id: '',
          name: 'Jazz',
          type: 'Genre',
          artists: [],
          durationMs: 0,
        },
      ],
    })
    expect(sections.flatMap((s) => s.items).map((i) => i.id)).toEqual(
      expect.arrayContaining([
        'action:search',
        'genre:name:Jazz',
        'mix:m1',
        'playlist:p1',
      ]),
    )
  })

  it('builds favorites-first songs and genre pages', () => {
    const songs = buildSongItems(
      [
        {
          id: 's2',
          name: 'B',
          type: 'Audio',
          artists: ['A'],
          durationMs: 1,
          albumId: 'al2',
        },
        {
          id: 's1',
          name: 'A',
          type: 'Audio',
          artists: ['A'],
          durationMs: 1,
          isFavorite: true,
          albumId: 'al1',
        },
        {
          id: 's3',
          name: 'C',
          type: 'Audio',
          artists: ['A'],
          durationMs: 1,
        },
      ],
      0,
      's1',
    )
    expect(songs[0]?.text).toBe('A')
    expect(songs[0]?.isPlaying).toBe(true)
    expect(songs[2]?.id).toBe('song:s3')

    const many = Array.from({ length: CARPLAY_PAGE_SIZE + 1 }, (_, i) => ({
      id: `g${i}`,
      name: `G${i}`,
      type: 'Genre' as const,
      artists: [],
      durationMs: 0,
    }))
    expect(buildGenreItems(many).at(-1)?.id).toBe(`genresMore:${CARPLAY_PAGE_SIZE}`)
  })

  it('patches playing dots on song, trackAt, queue, and offline rows', () => {
    const buffer = [{ id: 't0' }, { id: 't1' }, { id: 't2' }]
    const sections: readonly CarPlaySection[] = [
      {
        items: [
          { id: 'song:t0', text: 'A', isPlaying: true },
          { id: 'trackAt:1', text: 'B', artworkUri: 'file:///b.jpg' },
          { id: 'queue:0', text: 'Q0', isPlaying: true },
          { id: 'queue:1', text: 'Q1' },
          { id: 'offline:t2', text: 'Off' },
          { id: 'album:x', text: 'Album', showsDisclosureIndicator: true },
        ],
      },
    ]
    const next = patchCarPlayPlayingIndicators(sections, {
      playingId: 't1',
      trackBuffer: buffer,
      currentIndex: 1,
    })
    expect(next).not.toBe(sections)
    expect(next[0]?.items[0]?.isPlaying).toBeUndefined()
    expect(next[0]?.items[1]?.isPlaying).toBe(true)
    expect(next[0]?.items[1]?.artworkUri).toBe('file:///b.jpg')
    // Up Next is play-order: row 0 is always now playing.
    expect(next[0]?.items[2]?.isPlaying).toBe(true)
    expect(next[0]?.items[3]?.isPlaying).toBeUndefined()
    expect(next[0]?.items[4]?.isPlaying).toBeUndefined()
    expect(next[0]?.items[5]).toBe(sections[0]?.items[5])

    const same = patchCarPlayPlayingIndicators(next, {
      playingId: 't1',
      trackBuffer: buffer,
      currentIndex: 1,
    })
    expect(same).toBe(next)
  })

  it('pages track lists and builds queue rows with art', () => {
    const tracks = Array.from({ length: CARPLAY_PAGE_SIZE + 1 }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
      type: 'Audio' as const,
      artists: ['A'],
      durationMs: 1,
    }))
    const page0 = buildTrackListItems('playlist', 'p1', tracks, 0, 't0')
    expect(page0[0]?.id).toBe('play:playlist:p1')
    expect(page0.at(-1)?.id).toBe(`tracksMore:${CARPLAY_PAGE_SIZE}`)
    const page1 = buildTrackListItems('playlist', 'p1', tracks, CARPLAY_PAGE_SIZE)
    expect(page1[0]?.id).toBe(`trackAt:${CARPLAY_PAGE_SIZE}`)
    expect(page1.some((row) => row.id.startsWith('play:'))).toBe(false)

    const queue = buildQueueItems(
      [
        {
          id: 't1',
          title: 'One',
          artist: 'A',
          album: 'B',
          durationMs: 1,
          artworkUrl: 'file:///a.png',
        },
        {
          id: 't2',
          title: 'Two',
          artist: 'A',
          album: 'B',
          durationMs: 1,
        },
      ],
      1,
    )
    expect(queue[1]?.isPlaying).toBe(true)
    expect(queue[0]?.artworkUri).toBe('file:///a.png')
  })

  it('resolves offline artwork uris when path present', () => {
    const entry = {
      ...offlineEntry('t1'),
      artworkPath: 'art/t1.jpg',
    }
    const rows = buildOfflineItems([entry], 'file:///melofin')
    expect(rows[1]?.artworkUri).toBe('file:///melofin/art/t1.jpg')
    expect(
      tracksFromOffline([entry], 'file:///melofin')[0]?.artworkUrl,
    ).toBe('file:///melofin/art/t1.jpg')
  })

  it('formats playlist child counts and artist album fallback detail', () => {
    const rows = buildPlaylistItems([
      {
        id: 'p1',
        name: 'Picks',
        type: 'Playlist',
        artists: [],
        durationMs: 0,
        childCount: 1,
      },
    ])
    expect(rows[0]?.detailText).toBe(carplay.songCount(1))
    const detail = buildArtistDetailItems('a1', 'Artist One', [
      {
        id: 'al1',
        name: 'Album',
        type: 'MusicAlbum',
        artists: [],
        durationMs: 0,
      },
    ])
    expect(detail[2]?.detailText).toBe('Artist One')
  })
})
