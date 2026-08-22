import type { LibraryItem } from '@/src/services/jellyfin/library'
import type { OfflineEntry } from '@/src/domain/offline'
import type { QueueTrack } from '@/src/domain/queue'

export const CARPLAY_PAGE_SIZE = 40

export type CarPlayListItem = {
  readonly id: string
  readonly text: string
  readonly detailText?: string
  readonly showsDisclosureIndicator?: boolean
}

export type CarPlayBrowseSection = 'playlists' | 'albums' | 'artists' | 'offline'

export type CarPlayItemAction =
  | { readonly kind: 'shuffleAll' }
  | { readonly kind: 'search' }
  | { readonly kind: 'browse'; section: CarPlayBrowseSection }
  | { readonly kind: 'playlist'; readonly id: string }
  | { readonly kind: 'artist'; readonly id: string }
  | { readonly kind: 'artistPlay'; readonly id: string }
  | { readonly kind: 'album'; readonly id: string }
  | { readonly kind: 'offline'; readonly id: string }
  | { readonly kind: 'offlineAll' }
  | { readonly kind: 'artistsMore'; readonly offset: number }
  | { readonly kind: 'albumsMore'; readonly offset: number }
  | { readonly kind: 'playlistsMore'; readonly offset: number }
  | { readonly kind: 'artistAlbumsMore'; readonly artistId: string; readonly offset: number }

const songCount = (n: number | undefined) =>
  n === 1 ? '1 song' : `${n ?? 0} songs`

const idAfter = (raw: string, prefix: string) => {
  const id = raw.slice(prefix.length)
  return id.length > 0 ? id : null
}

const moreOffset = (raw: string, prefix: string) => {
  if (!raw.startsWith(prefix)) return null
  const offset = Number(raw.slice(prefix.length))
  return Number.isFinite(offset) ? offset : null
}

export const parseCarPlayItemId = (raw: string): CarPlayItemAction | null => {
  if (raw === 'action:shuffleAll') return { kind: 'shuffleAll' }
  if (raw === 'action:search') return { kind: 'search' }
  if (raw === 'offline:all') return { kind: 'offlineAll' }
  if (raw.startsWith('browse:')) {
    const section = raw.slice('browse:'.length) as CarPlayBrowseSection
    if (section === 'playlists' || section === 'albums' || section === 'artists' || section === 'offline') {
      return { kind: 'browse', section }
    }
    return null
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
  const artistsMore = moreOffset(raw, 'artistsMore:')
  if (artistsMore !== null) return { kind: 'artistsMore', offset: artistsMore }
  const albumsMore = moreOffset(raw, 'albumsMore:')
  if (albumsMore !== null) return { kind: 'albumsMore', offset: albumsMore }
  const playlistsMore = moreOffset(raw, 'playlistsMore:')
  if (playlistsMore !== null) return { kind: 'playlistsMore', offset: playlistsMore }

  const prefixed = [
    ['artistPlay:', 'artistPlay'],
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
        text: 'Show more',
        detailText: `${items.length - next} remaining`,
      },
    ]
  }
  return rows
}

export const buildLibraryRootItems = (
  offline: readonly OfflineEntry[],
): readonly CarPlayListItem[] => {
  const downloads = offline.filter((entry) => entry.complete).length
  return [
    { id: 'action:shuffleAll', text: 'Shuffle All' },
    {
      id: 'action:search',
      text: 'Search',
      showsDisclosureIndicator: true,
    },
    browseRow('playlists', 'Playlists'),
    browseRow('albums', 'Albums'),
    browseRow('artists', 'Artists'),
    ...(downloads > 0
      ? [browseRow('offline', 'Downloads', songCount(downloads))]
      : []),
  ]
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

export const buildOfflineItems = (
  offline: readonly OfflineEntry[],
): readonly CarPlayListItem[] => {
  const complete = offline.filter((entry) => entry.complete)
  return [
    {
      id: 'offline:all',
      text: 'Play all downloads',
      detailText: songCount(complete.length),
    },
    ...complete.map((entry) => ({
      id: `offline:${entry.itemId}`,
      text: entry.title,
      detailText: entry.artist,
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
    id: `artistPlay:${artistId}`,
    text: 'Play artist',
    detailText: artistName,
  },
  ...pagedRows(
    albums,
    offset,
    (album) => ({
      id: `album:${album.id}`,
      text: album.name,
      detailText: album.artists[0] ?? artistName,
    }),
    (next) => `artistAlbumsMore:${artistId}@${next}`,
  ),
]

export const tracksFromOffline = (
  offline: readonly OfflineEntry[],
): readonly QueueTrack[] =>
  offline
    .filter((entry) => entry.complete)
    .map((entry) => ({
      id: entry.itemId,
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      durationMs: entry.durationMs,
      artworkUrl: entry.artworkPath,
    }))
