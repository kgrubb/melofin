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
  const out: CarPlaySection[] = []
  let used = 0
  for (const section of sections) {
    if (used >= budget) break
    const items: CarPlayListItem[] = []
    for (const item of section.items) {
      if (used >= budget) break
      items.push(item)
      used += 1
    }
    if (items.length > 0) {
      out.push({ header: section.header, items })
    }
  }
  return out
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

/** Library hub — no shuffle/search (those live on Home / Search). */
export const buildLibraryHubItems = (
  offline: readonly OfflineEntry[],
): readonly CarPlayListItem[] => {
  const downloads = offline.filter((entry) => entry.complete).length
  return [
    browseRow('playlists', carplay.playlists()),
    browseRow('albums', carplay.albums()),
    browseRow('artists', carplay.artists()),
    browseRow('songs', carplay.songs()),
    browseRow('genres', carplay.genres()),
    browseRow('mixes', carplay.mixes()),
    ...(downloads > 0
      ? [browseRow('offline', carplay.downloads(), songCount(downloads))]
      : []),
  ]
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
}

const songRow = (item: LibraryItem, playingId?: string): CarPlayListItem => ({
  id: `song:${item.id}`,
  text: item.name,
  detailText: item.artists[0],
  isPlaying: playingId === item.id ? true : undefined,
})

const mediaRow = (
  item: LibraryItem,
  playingId?: string,
): CarPlayListItem => {
  if (item.type === 'MusicArtist') {
    return {
      id: `artist:${item.id}`,
      text: item.name,
      showsDisclosureIndicator: true,
    }
  }
  if (item.type === 'Playlist') {
    return {
      id: `playlist:${item.id}`,
      text: item.name,
      detailText: item.childCount ? songCount(item.childCount) : undefined,
      showsDisclosureIndicator: true,
    }
  }
  if (item.type === 'Audio') {
    return songRow(item, playingId)
  }
  return {
    id: `album:${item.id}`,
    text: item.name,
    detailText: item.artists[0],
    showsDisclosureIndicator: true,
  }
}

export const buildHomeSections = (
  input: HomeSectionsInput,
  maxItems = CARPLAY_DEFAULT_MAX_ITEMS,
): readonly CarPlaySection[] => {
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
      items: input.resume.slice(0, 4).map((item) => mediaRow(item, input.playingId)),
    })
  }
  if (input.recent && input.recent.length > 0) {
    sections.push({
      header: carplay.recentlyPlayed(),
      items: input.recent.slice(0, 4).map((item) => mediaRow(item, input.playingId)),
    })
  }
  if (input.mixes && input.mixes.length > 0) {
    const first = input.mixes[0]!
    const imageRowUris = (first.artworkUris ?? []).slice(0, 8)
    sections.push({
      header: carplay.yourMixes(),
      items: [
        ...(imageRowUris.length > 0
          ? [
              {
                id: `mix:${first.id}`,
                text: first.title,
                detailText: first.subtitle,
                imageRowUris,
              } satisfies CarPlayListItem,
            ]
          : []),
        ...input.mixes.map((mix) => ({
          id: `mix:${mix.id}`,
          text: mix.title,
          detailText: mix.subtitle,
          showsDisclosureIndicator: true,
        })),
      ],
    })
  }
  if (input.favoriteArtists && input.favoriteArtists.length > 0) {
    sections.push({
      header: carplay.favoriteArtists(),
      items: input.favoriteArtists.slice(0, 4).map((item) => ({
        id: `artist:${item.id}`,
        text: item.name,
        showsDisclosureIndicator: true,
      })),
    })
  }
  if (input.favoriteTracks && input.favoriteTracks.length > 0) {
    sections.push({
      header: carplay.favoriteTracks(),
      items: input.favoriteTracks.slice(0, 4).map((item) => songRow(item, input.playingId)),
    })
  }
  if (input.latestAlbums && input.latestAlbums.length > 0) {
    sections.push({
      header: carplay.latestAlbums(),
      items: input.latestAlbums.slice(0, 4).map((item) => ({
        id: `album:${item.id}`,
        text: item.name,
        detailText: item.artists[0],
        showsDisclosureIndicator: true,
      })),
    })
  }
  if (input.playlists && input.playlists.length > 0) {
    sections.push({
      header: carplay.playlists(),
      items: input.playlists.slice(0, 4).map((item) => ({
        id: `playlist:${item.id}`,
        text: item.name,
        detailText: item.childCount ? songCount(item.childCount) : undefined,
        showsDisclosureIndicator: true,
      })),
    })
  }

  return trimSectionsToBudget(sections, maxItems)
}

export type SearchExploreInput = {
  readonly genres?: readonly LibraryItem[]
  readonly mixes?: readonly HomeMixRow[]
  readonly playlists?: readonly LibraryItem[]
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
      items: input.mixes.slice(0, 4).map((mix) => ({
        id: `mix:${mix.id}`,
        text: mix.title,
        detailText: mix.subtitle,
        showsDisclosureIndicator: true,
      })),
    })
  }
  if (input.playlists && input.playlists.length > 0) {
    sections.push({
      header: carplay.playlists(),
      items: input.playlists.slice(0, 4).map((item) => ({
        id: `playlist:${item.id}`,
        text: item.name,
        detailText: item.childCount ? songCount(item.childCount) : undefined,
        showsDisclosureIndicator: true,
      })),
    })
  }
  return trimSectionsToBudget(sections, maxItems)
}

export const buildPlaylistItems = (
  playlists: readonly LibraryItem[],
  offset = 0,
): readonly CarPlayListItem[] =>
  pagedRows(
    playlists,
    offset,
    (item) => ({
      id: `playlist:${item.id}`,
      text: item.name,
      detailText: item.childCount ? songCount(item.childCount) : undefined,
      showsDisclosureIndicator: true,
    }),
    (next) => `playlistsMore:${next}`,
  )

export const buildAlbumItems = (
  albums: readonly LibraryItem[],
  offset = 0,
): readonly CarPlayListItem[] =>
  pagedRows(
    albums,
    offset,
    (item) => ({
      id: `album:${item.id}`,
      text: item.name,
      detailText: item.artists[0],
      showsDisclosureIndicator: true,
    }),
    (next) => `albumsMore:${next}`,
  )

export const buildArtistItems = (
  artists: readonly LibraryItem[],
  offset = 0,
): readonly CarPlayListItem[] =>
  pagedRows(
    artists,
    offset,
    (item) => ({
      id: `artist:${item.id}`,
      text: item.name,
      showsDisclosureIndicator: true,
    }),
    (next) => `artistsMore:${next}`,
  )

/** Favorites-first song pages from library cache. */
export const buildSongItems = (
  songs: readonly LibraryItem[],
  offset = 0,
  playingId?: string,
): readonly CarPlayListItem[] => {
  const favorites = songs.filter((song) => song.isFavorite)
  const rest = songs.filter((song) => !song.isFavorite)
  const ordered = [...favorites, ...rest]
  return pagedRows(
    ordered,
    offset,
    (item) => songRow(item, playingId),
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
    (album) => ({
      id: `album:${album.id}`,
      text: album.name,
      detailText: album.artists[0] ?? artistName,
      showsDisclosureIndicator: true,
    }),
    (next) => `artistAlbumsMore:${artistId}@${next}`,
  ),
]

export const buildTrackListItems = (
  containerType: 'album' | 'playlist',
  containerId: string,
  tracks: readonly LibraryItem[],
  offset = 0,
  playingId?: string,
): readonly CarPlayListItem[] => {
  const header: readonly CarPlayListItem[] =
    offset === 0
      ? [
          { id: `play:${containerType}:${containerId}`, text: carplay.play() },
          { id: `shuffle:${containerType}:${containerId}`, text: carplay.shuffle() },
        ]
      : []
  const slice = tracks.slice(offset, offset + CARPLAY_PAGE_SIZE)
  const rows = slice.map((track, i) => ({
    id: `trackAt:${offset + i}`,
    text: track.name,
    detailText: track.artists[0],
    isPlaying: playingId === track.id ? true : undefined,
  }))
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
