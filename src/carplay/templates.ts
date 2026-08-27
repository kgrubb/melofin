import type { LibraryItem } from '@/src/services/jellyfin/library'
import type { OfflineEntry } from '@/src/domain/offline'
import { resolveOfflineFileUri } from '@/src/domain/offline'
import type { QueueTrack } from '@/src/domain/queue'
import { carplay } from '@/src/i18n/carplayCopy'

export const CARPLAY_DEFAULT_MAX_ITEMS = 12
export const CARPLAY_PAGE_SIZE = 40

export type CarPlayListItem = {
  readonly id: string
  readonly text: string
  readonly detailText?: string
  readonly showsDisclosureIndicator?: boolean
  readonly artworkUri?: string
  readonly imageRowUris?: readonly string[]
  readonly isPlaying?: boolean
}

export type CarPlaySection = {
  readonly header?: string
  readonly items: readonly CarPlayListItem[]
}

export type CarPlayBrowseSection =
  | 'playlists'
  | 'albums'
  | 'artists'
  | 'songs'
  | 'genres'
  | 'offline'
  | 'mixes'

export type CarPlayItemAction =
  | { readonly kind: 'shuffleAll' }
  | { readonly kind: 'shuffleFavorites' }
  | { readonly kind: 'shuffleDownloads' }
  | { readonly kind: 'search' }
  | { readonly kind: 'browse'; readonly section: CarPlayBrowseSection }
  | {
      readonly kind: 'play'
      readonly type: 'album' | 'playlist' | 'artist'
      readonly id: string
    }
  | {
      readonly kind: 'shuffle'
      readonly type: 'album' | 'playlist' | 'artist'
      readonly id: string
    }
  | { readonly kind: 'album'; readonly id: string }
  | { readonly kind: 'playlist'; readonly id: string }
  | { readonly kind: 'artist'; readonly id: string }
  | { readonly kind: 'song'; readonly id: string }
  | { readonly kind: 'trackAt'; readonly index: number }
  | { readonly kind: 'queue'; readonly index: number }
  | { readonly kind: 'genre'; readonly id: string }
  | { readonly kind: 'genreName'; readonly name: string }
  | { readonly kind: 'mix'; readonly id: string }
  | { readonly kind: 'offline'; readonly id: string }
  | { readonly kind: 'offlineAll' }
  | { readonly kind: 'songsMore'; readonly offset: number }
  | { readonly kind: 'artistsMore'; readonly offset: number }
  | { readonly kind: 'albumsMore'; readonly offset: number }
  | { readonly kind: 'playlistsMore'; readonly offset: number }
  | { readonly kind: 'genresMore'; readonly offset: number }
  | { readonly kind: 'tracksMore'; readonly offset: number }
  | {
      readonly kind: 'artistAlbumsMore'
      readonly artistId: string
      readonly offset: number
    }

const songCount = (n: number | undefined) => carplay.songCount(n ?? 0)

/** Optional resolver so builders stay pure and session can supply Jellyfin URLs. */
export type CarPlayArtFor = (item: LibraryItem) => string | undefined

const withArt = (
  item: CarPlayListItem,
  artworkUri: string | undefined,
): CarPlayListItem => (artworkUri ? { ...item, artworkUri } : item)

const offlineArtworkUri = (
  artworkPath: string | undefined,
  melofinRootUri?: string,
): string | undefined => {
  if (!artworkPath) return undefined
  return resolveOfflineFileUri(artworkPath, melofinRootUri)
}

const idAfter = (raw: string, prefix: string) => {
  const id = raw.slice(prefix.length)
  return id.length > 0 ? id : null
}

const moreOffset = (raw: string, prefix: string) => {
  if (!raw.startsWith(prefix)) return null
  const offset = Number(raw.slice(prefix.length))
  return Number.isFinite(offset) ? offset : null
}

/** Each row counts as 1 (image rows included). */
export const trimSectionsToBudget = (
  sections: readonly CarPlaySection[],
  maxItems: number,
): readonly CarPlaySection[] => {
  const budget = Math.max(0, Math.floor(maxItems))
  if (budget === 0) return []
  return sections.reduce<{
    readonly out: readonly CarPlaySection[]
    readonly used: number
  }>(
    (acc, section) => {
      if (acc.used >= budget) return acc
      const items = section.items.slice(0, budget - acc.used)
      if (items.length === 0) return acc
      return {
        out: [...acc.out, { header: section.header, items }],
        used: acc.used + items.length,
      }
    },
    { out: [], used: 0 },
  ).out
}

export const parseCarPlayItemId = (raw: string): CarPlayItemAction | null => {
  if (raw === 'action:shuffleAll') return { kind: 'shuffleAll' }
  if (raw === 'action:shuffleFavorites') return { kind: 'shuffleFavorites' }
  if (raw === 'action:shuffleDownloads') return { kind: 'shuffleDownloads' }
  if (raw === 'action:search') return { kind: 'search' }
  if (raw === 'offline:all') return { kind: 'offlineAll' }

  if (raw.startsWith('browse:')) {
    const section = raw.slice('browse:'.length) as CarPlayBrowseSection
    if (
      section === 'playlists' ||
      section === 'albums' ||
      section === 'artists' ||
      section === 'songs' ||
      section === 'genres' ||
      section === 'offline' ||
      section === 'mixes'
    ) {
      return { kind: 'browse', section }
    }
    return null
  }

  const playOrShuffle = (prefix: 'play:' | 'shuffle:', kind: 'play' | 'shuffle') => {
    if (!raw.startsWith(prefix)) return null
    const body = raw.slice(prefix.length)
    const split = body.indexOf(':')
    if (split <= 0) return null
    const type = body.slice(0, split)
    const id = body.slice(split + 1)
    if ((type === 'album' || type === 'playlist' || type === 'artist') && id) {
      return { kind, type, id } as const
    }
    return null
  }
  const played = playOrShuffle('play:', 'play')
  if (played) return played
  const shuffled = playOrShuffle('shuffle:', 'shuffle')
  if (shuffled) return shuffled

  if (raw.startsWith('trackAt:')) {
    const index = Number(raw.slice('trackAt:'.length))
    return Number.isFinite(index) ? { kind: 'trackAt', index } : null
  }
  if (raw.startsWith('queue:')) {
    const index = Number(raw.slice('queue:'.length))
    return Number.isFinite(index) ? { kind: 'queue', index } : null
  }

  if (raw.startsWith('genre:id:')) {
    const id = idAfter(raw, 'genre:id:')
    return id ? { kind: 'genre', id } : null
  }
  if (raw.startsWith('genre:name:')) {
    const name = idAfter(raw, 'genre:name:')
    return name ? { kind: 'genreName', name } : null
  }
  if (raw.startsWith('genre:')) {
    const id = idAfter(raw, 'genre:')
    return id ? { kind: 'genre', id } : null
  }

  if (raw.startsWith('mix:')) {
    const id = idAfter(raw, 'mix:')
    return id ? { kind: 'mix', id } : null
  }

  if (raw.startsWith('artistAlbumsMore:')) {
    const body = raw.slice('artistAlbumsMore:'.length)
    const split = body.lastIndexOf('@')
    if (split <= 0) return null
    const artistId = body.slice(0, split)
    const offset = Number(body.slice(split + 1))
    return artistId && Number.isFinite(offset)
      ? { kind: 'artistAlbumsMore', artistId, offset }
      : null
  }

  const songsMore = moreOffset(raw, 'songsMore:')
  if (songsMore !== null) return { kind: 'songsMore', offset: songsMore }
  const artistsMore = moreOffset(raw, 'artistsMore:')
  if (artistsMore !== null) return { kind: 'artistsMore', offset: artistsMore }
  const albumsMore = moreOffset(raw, 'albumsMore:')
  if (albumsMore !== null) return { kind: 'albumsMore', offset: albumsMore }
  const playlistsMore = moreOffset(raw, 'playlistsMore:')
  if (playlistsMore !== null) return { kind: 'playlistsMore', offset: playlistsMore }
  const genresMore = moreOffset(raw, 'genresMore:')
  if (genresMore !== null) return { kind: 'genresMore', offset: genresMore }
  const tracksMore = moreOffset(raw, 'tracksMore:')
  if (tracksMore !== null) return { kind: 'tracksMore', offset: tracksMore }

  if (raw.startsWith('song:')) {
    const id = idAfter(raw, 'song:')
    return id ? { kind: 'song', id } : null
  }

  const prefixed = [
    ['playlist:', 'playlist'],
    ['artist:', 'artist'],
    ['album:', 'album'],
    ['offline:', 'offline'],
  ] as const
  for (const [prefix, kind] of prefixed) {
    if (!raw.startsWith(prefix)) continue
    const id = idAfter(raw, prefix)
    if (id) return { kind, id }
  }
  return null
}

const browseRow = (
  section: CarPlayBrowseSection,
  text: string,
  detailText?: string,
): CarPlayListItem => ({
  id: `browse:${section}`,
  text,
  detailText,
  showsDisclosureIndicator: true,
})

const pagedRows = (
  items: readonly LibraryItem[],
  offset: number,
  row: (item: LibraryItem) => CarPlayListItem,
  moreId: (nextOffset: number) => string,
): readonly CarPlayListItem[] => {
  const slice = items.slice(offset, offset + CARPLAY_PAGE_SIZE)
  const rows = slice.map(row)
  const next = offset + CARPLAY_PAGE_SIZE
  if (next < items.length) {
    return [
      ...rows,
      {
        id: moreId(next),
        text: carplay.showMore(),
        detailText: carplay.remaining(items.length - next),
      },
    ]
  }
  return rows
}

export type HomeMixRow = {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly artworkUris?: readonly string[]
}

export type HomeSectionsInput = {
  readonly resume?: readonly LibraryItem[]
  readonly recent?: readonly LibraryItem[]
  readonly mixes?: readonly HomeMixRow[]
  readonly favoriteArtists?: readonly LibraryItem[]
  readonly favoriteTracks?: readonly LibraryItem[]
  readonly latestAlbums?: readonly LibraryItem[]
  readonly playlists?: readonly LibraryItem[]
  readonly downloadCount?: number
  readonly playingId?: string
  readonly artFor?: CarPlayArtFor
}

const songRow = (
  item: LibraryItem,
  playingId?: string,
  artworkUri?: string,
): CarPlayListItem =>
  withArt(
    {
      id: `song:${item.id}`,
      text: item.name,
      detailText: item.artists[0],
      isPlaying: playingId === item.id ? true : undefined,
    },
    artworkUri,
  )

const mediaRow = (
  item: LibraryItem,
  playingId?: string,
  artworkUri?: string,
): CarPlayListItem => {
  if (item.type === 'MusicArtist') {
    return withArt(
      {
        id: `artist:${item.id}`,
        text: item.name,
        showsDisclosureIndicator: true,
      },
      artworkUri,
    )
  }
  if (item.type === 'Playlist') {
    return withArt(
      {
        id: `playlist:${item.id}`,
        text: item.name,
        detailText: item.childCount ? songCount(item.childCount) : undefined,
        showsDisclosureIndicator: true,
      },
      artworkUri,
    )
  }
  if (item.type === 'Audio') {
    return songRow(item, playingId, artworkUri)
  }
  return withArt(
    {
      id: `album:${item.id}`,
      text: item.name,
      detailText: item.artists[0],
      showsDisclosureIndicator: true,
    },
    artworkUri,
  )
}

export const mixRow = (mix: HomeMixRow): CarPlayListItem => {
  const uris = (mix.artworkUris ?? []).filter(Boolean)
  if (uris.length >= 2) {
    return {
      id: `mix:${mix.id}`,
      text: mix.title,
      detailText: mix.subtitle,
      imageRowUris: uris.slice(0, 4),
    }
  }
  return withArt(
    {
      id: `mix:${mix.id}`,
      text: mix.title,
      detailText: mix.subtitle,
      showsDisclosureIndicator: true,
    },
    uris[0],
  )
}

const libraryBrowseRows = (downloadCount: number): readonly CarPlayListItem[] => {
  const browse: CarPlayListItem[] = [
    browseRow('playlists', carplay.playlists()),
    browseRow('albums', carplay.albums()),
    browseRow('artists', carplay.artists()),
    browseRow('songs', carplay.songs()),
    browseRow('genres', carplay.genres()),
    browseRow('mixes', carplay.mixes()),
  ]
  if (downloadCount > 0) {
    browse.push(browseRow('offline', carplay.downloads(), songCount(downloadCount)))
  }
  return browse
}

/** Library hub: real latest albums (when known), then browse. Browse is never trimmed. */
export type LibraryHubInput = {
  readonly recentAlbums?: readonly LibraryItem[]
  readonly downloadCount?: number
  readonly artFor?: CarPlayArtFor
}

export const buildLibraryHubSections = (
  input: LibraryHubInput,
  maxItems = CARPLAY_DEFAULT_MAX_ITEMS,
): readonly CarPlaySection[] => {
  const browse = libraryBrowseRows(input.downloadCount ?? 0)
  const recentSlots = Math.min(4, Math.max(0, Math.floor(maxItems) - browse.length))
  const recent = (input.recentAlbums ?? []).slice(0, recentSlots)
  const sections: CarPlaySection[] = []
  if (recent.length > 0) {
    sections.push({
      header: carplay.latestAlbums(),
      items: recent.map((item) =>
        mediaRow(item, undefined, input.artFor?.(item)),
      ),
    })
  }
  sections.push({ items: browse })
  return sections
}

export const buildLibraryHubItems = (
  offline: readonly OfflineEntry[],
): readonly CarPlayListItem[] =>
  libraryBrowseRows(offline.filter((entry) => entry.complete).length)

export const buildHomeSections = (
  input: HomeSectionsInput,
  maxItems = CARPLAY_DEFAULT_MAX_ITEMS,
): readonly CarPlaySection[] => {
  const artFor = input.artFor
  const row = (item: LibraryItem) =>
    mediaRow(item, input.playingId, artFor?.(item))
  const actions: CarPlayListItem[] = [
    { id: 'action:shuffleAll', text: carplay.shuffleAll() },
    { id: 'action:shuffleFavorites', text: carplay.shuffleFavorites() },
  ]
  if ((input.downloadCount ?? 0) > 0) {
    actions.push({
      id: 'action:shuffleDownloads',
      text: carplay.shuffleDownloads(),
      detailText: songCount(input.downloadCount),
    })
  }

  const sections: CarPlaySection[] = [{ items: actions }]

  if (input.resume && input.resume.length > 0) {
    sections.push({
      header: carplay.continueListening(),
      items: input.resume.slice(0, 4).map(row),
    })
  }
  if (input.recent && input.recent.length > 0) {
    sections.push({
      header: carplay.recentlyPlayed(),
      items: input.recent.slice(0, 4).map(row),
    })
  }
  if (input.mixes && input.mixes.length > 0) {
    sections.push({
      header: carplay.yourMixes(),
      items: input.mixes.slice(0, 4).map(mixRow),
    })
  }
  if (input.favoriteArtists && input.favoriteArtists.length > 0) {
    sections.push({
      header: carplay.favoriteArtists(),
      items: input.favoriteArtists.slice(0, 4).map(row),
    })
  }
  if (input.favoriteTracks && input.favoriteTracks.length > 0) {
    sections.push({
      header: carplay.favoriteTracks(),
      items: input.favoriteTracks.slice(0, 4).map(row),
    })
  }
  if (input.latestAlbums && input.latestAlbums.length > 0) {
    sections.push({
      header: carplay.latestAlbums(),
      items: input.latestAlbums.slice(0, 4).map(row),
    })
  }
  if (input.playlists && input.playlists.length > 0) {
    sections.push({
      header: carplay.playlists(),
      items: input.playlists.slice(0, 4).map(row),
    })
  }

  return trimSectionsToBudget(sections, maxItems)
}

export type SearchExploreInput = {
  readonly genres?: readonly LibraryItem[]
  readonly mixes?: readonly HomeMixRow[]
  readonly playlists?: readonly LibraryItem[]
  readonly artFor?: CarPlayArtFor
}

export const buildSearchExploreSections = (
  input: SearchExploreInput,
  maxItems = CARPLAY_DEFAULT_MAX_ITEMS,
): readonly CarPlaySection[] => {
  const sections: CarPlaySection[] = [
    {
      items: [
        {
          id: 'action:search',
          text: carplay.search(),
          detailText: carplay.searchHint(),
          showsDisclosureIndicator: true,
        },
      ],
    },
  ]
  if (input.genres && input.genres.length > 0) {
    sections.push({
      header: carplay.genres(),
      items: input.genres.slice(0, 6).map((genre) => ({
        id: genre.id ? `genre:id:${genre.id}` : `genre:name:${genre.name}`,
        text: genre.name,
        showsDisclosureIndicator: true,
      })),
    })
  }
  if (input.mixes && input.mixes.length > 0) {
    sections.push({
      header: carplay.yourMixes(),
      items: input.mixes.slice(0, 4).map(mixRow),
    })
  }
  if (input.playlists && input.playlists.length > 0) {
    sections.push({
      header: carplay.playlists(),
      items: input.playlists
        .slice(0, 4)
        .map((item) => mediaRow(item, undefined, input.artFor?.(item))),
    })
  }
  return trimSectionsToBudget(sections, maxItems)
}

export const buildPlaylistItems = (
  playlists: readonly LibraryItem[],
  offset = 0,
  artFor?: CarPlayArtFor,
): readonly CarPlayListItem[] =>
  pagedRows(
    playlists,
    offset,
    (item) => mediaRow(item, undefined, artFor?.(item)),
    (next) => `playlistsMore:${next}`,
  )

export const buildAlbumItems = (
  albums: readonly LibraryItem[],
  offset = 0,
  artFor?: CarPlayArtFor,
): readonly CarPlayListItem[] =>
  pagedRows(
    albums,
    offset,
    (item) => mediaRow(item, undefined, artFor?.(item)),
    (next) => `albumsMore:${next}`,
  )

export const buildArtistItems = (
  artists: readonly LibraryItem[],
  offset = 0,
  artFor?: CarPlayArtFor,
): readonly CarPlayListItem[] =>
  pagedRows(
    artists,
    offset,
    (item) => mediaRow(item, undefined, artFor?.(item)),
    (next) => `artistsMore:${next}`,
  )

/** Favorites-first song pages from library cache. */
export const buildSongItems = (
  songs: readonly LibraryItem[],
  offset = 0,
  playingId?: string,
  artFor?: CarPlayArtFor,
): readonly CarPlayListItem[] => {
  const favorites = songs.filter((song) => song.isFavorite)
  const rest = songs.filter((song) => !song.isFavorite)
  const ordered = [...favorites, ...rest]
  return pagedRows(
    ordered,
    offset,
    (item) => songRow(item, playingId, artFor?.(item)),
    (next) => `songsMore:${next}`,
  )
}

export const buildGenreItems = (
  genres: readonly LibraryItem[],
  offset = 0,
): readonly CarPlayListItem[] =>
  pagedRows(
    genres,
    offset,
    (item) => ({
      id: item.id ? `genre:id:${item.id}` : `genre:name:${item.name}`,
      text: item.name,
      showsDisclosureIndicator: true,
    }),
    (next) => `genresMore:${next}`,
  )

export const buildOfflineItems = (
  offline: readonly OfflineEntry[],
  melofinRootUri?: string,
): readonly CarPlayListItem[] => {
  const complete = offline.filter((entry) => entry.complete)
  return [
    {
      id: 'offline:all',
      text: carplay.playAllDownloads(),
      detailText: songCount(complete.length),
    },
    ...complete.map((entry) => ({
      id: `offline:${entry.itemId}`,
      text: entry.title,
      detailText: entry.artist,
      artworkUri: offlineArtworkUri(entry.artworkPath, melofinRootUri),
    })),
  ]
}

export const buildArtistDetailItems = (
  artistId: string,
  artistName: string,
  albums: readonly LibraryItem[],
  offset = 0,
  artFor?: CarPlayArtFor,
): readonly CarPlayListItem[] => [
  {
    id: `play:artist:${artistId}`,
    text: carplay.playArtist(),
    detailText: artistName,
  },
  {
    id: `shuffle:artist:${artistId}`,
    text: carplay.shuffleArtist(),
    detailText: artistName,
  },
  ...pagedRows(
    albums,
    offset,
    (album) =>
      withArt(
        {
          id: `album:${album.id}`,
          text: album.name,
          detailText: album.artists[0] ?? artistName,
          showsDisclosureIndicator: true,
        },
        artFor?.(album),
      ),
    (next) => `artistAlbumsMore:${artistId}@${next}`,
  ),
]

export const buildTrackListItems = (
  containerType: 'album' | 'playlist',
  containerId: string,
  tracks: readonly LibraryItem[],
  offset = 0,
  playingId?: string,
  artFor?: CarPlayArtFor,
): readonly CarPlayListItem[] => {
  const header: readonly CarPlayListItem[] =
    offset === 0
      ? [
          { id: `play:${containerType}:${containerId}`, text: carplay.play() },
          { id: `shuffle:${containerType}:${containerId}`, text: carplay.shuffle() },
        ]
      : []
  const slice = tracks.slice(offset, offset + CARPLAY_PAGE_SIZE)
  const rows = slice.map((track, i) =>
    withArt(
      {
        id: `trackAt:${offset + i}`,
        text: track.name,
        detailText: track.artists[0],
        isPlaying: playingId === track.id ? true : undefined,
      },
      artFor?.(track),
    ),
  )
  const next = offset + CARPLAY_PAGE_SIZE
  const more =
    next < tracks.length
      ? [
          {
            id: `tracksMore:${next}`,
            text: carplay.showMore(),
            detailText: carplay.remaining(tracks.length - next),
          },
        ]
      : []
  return [...header, ...rows, ...more]
}

export const buildQueueItems = (
  tracks: readonly QueueTrack[],
  currentIndex: number,
): readonly CarPlayListItem[] =>
  tracks.map((track, index) => ({
    id: `queue:${index}`,
    text: track.title,
    detailText: track.artist,
    artworkUri: track.artworkUrl,
    isPlaying: index === currentIndex ? true : undefined,
  }))

export const tracksFromOffline = (
  offline: readonly OfflineEntry[],
  melofinRootUri?: string,
): readonly QueueTrack[] =>
  offline
    .filter((entry) => entry.complete)
    .map((entry) => ({
      id: entry.itemId,
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      durationMs: entry.durationMs,
      artworkUrl: offlineArtworkUri(entry.artworkPath, melofinRootUri),
    }))
