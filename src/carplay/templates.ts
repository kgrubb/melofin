import type { LibraryItem } from '@/src/services/jellyfin/library'
import type { OfflineEntry } from '@/src/domain/offline'
import type { QueueTrack } from '@/src/domain/queue'

/** CarPlay list page size ("More..." for the rest). */
export const CARPLAY_PAGE_SIZE = 40

export type CarPlayListSection = {
  readonly title: string
  readonly items: readonly {
    readonly id: string
    readonly text: string
    readonly detailText?: string
  }[]
}

export type CarPlayItemAction =
  | { readonly kind: 'playlist'; readonly id: string }
  | { readonly kind: 'artist'; readonly id: string }
  | { readonly kind: 'album'; readonly id: string }
  | { readonly kind: 'offline'; readonly id: string }
  | { readonly kind: 'offlineAll' }
  | { readonly kind: 'artistsMore'; readonly offset: number }
  | { readonly kind: 'albumsMore'; readonly offset: number }

export const parseCarPlayItemId = (raw: string): CarPlayItemAction | null => {
  if (raw === 'offline:all') return { kind: 'offlineAll' }
  if (raw.startsWith('playlist:')) {
    const id = raw.slice('playlist:'.length)
    return id ? { kind: 'playlist', id } : null
  }
  if (raw.startsWith('artist:')) {
    const id = raw.slice('artist:'.length)
    return id ? { kind: 'artist', id } : null
  }
  if (raw.startsWith('album:')) {
    const id = raw.slice('album:'.length)
    return id ? { kind: 'album', id } : null
  }
  if (raw.startsWith('offline:')) {
    const id = raw.slice('offline:'.length)
    return id ? { kind: 'offline', id } : null
  }
  if (raw.startsWith('artistsMore:')) {
    const offset = Number(raw.slice('artistsMore:'.length))
    return Number.isFinite(offset) ? { kind: 'artistsMore', offset } : null
  }
  if (raw.startsWith('albumsMore:')) {
    const offset = Number(raw.slice('albumsMore:'.length))
    return Number.isFinite(offset) ? { kind: 'albumsMore', offset } : null
  }
  return null
}

const pageItems = (
  items: readonly LibraryItem[],
  offset: number,
  idPrefix: 'artist' | 'album',
  morePrefix: 'artistsMore' | 'albumsMore',
): readonly CarPlayListSection['items'][number][] => {
  const slice = items.slice(offset, offset + CARPLAY_PAGE_SIZE)
  const rows = slice.map((item) => ({
    id: `${idPrefix}:${item.id}`,
    text: item.name,
    detailText:
      idPrefix === 'album' && item.artists[0] ? item.artists[0] : undefined,
  }))
  if (offset + CARPLAY_PAGE_SIZE < items.length) {
    return [
      ...rows,
      {
        id: `${morePrefix}:${offset + CARPLAY_PAGE_SIZE}`,
        text: 'More...',
        detailText: `${items.length - offset - CARPLAY_PAGE_SIZE} more`,
      },
    ]
  }
  return rows
}

export const buildLibrarySections = (
  playlists: readonly LibraryItem[],
  artists: readonly LibraryItem[],
  offline: readonly OfflineEntry[],
  albums: readonly LibraryItem[] = [],
  opts?: {
    readonly artistsOffset?: number
    readonly albumsOffset?: number
  },
): readonly CarPlayListSection[] => {
  const complete = offline.filter((entry) => entry.complete)
  const artistsOffset = opts?.artistsOffset ?? 0
  const albumsOffset = opts?.albumsOffset ?? 0
  return [
    {
      title: 'Playlists',
      items: playlists.slice(0, CARPLAY_PAGE_SIZE).map((item) => ({
        id: `playlist:${item.id}`,
        text: item.name,
        detailText: item.childCount ? `${item.childCount} tracks` : undefined,
      })),
    },
    {
      title: 'Albums',
      items: pageItems(albums, albumsOffset, 'album', 'albumsMore'),
    },
    {
      title: 'Artists',
      items: pageItems(artists, artistsOffset, 'artist', 'artistsMore'),
    },
    {
      title: 'Offline',
      items: [
        ...(complete.length > 0
          ? [
              {
                id: 'offline:all',
                text: 'Play all downloads',
                detailText: `${complete.length} tracks`,
              },
            ]
          : []),
        ...complete.map((entry) => ({
          id: `offline:${entry.itemId}`,
          text: entry.title,
          detailText: entry.artist,
        })),
      ],
    },
  ]
}

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
