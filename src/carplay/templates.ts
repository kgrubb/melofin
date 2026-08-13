import type { LibraryItem } from '@/src/services/jellyfin/library'
import type { OfflineEntry } from '@/src/domain/offline'
import type { QueueTrack } from '@/src/domain/queue'

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
  | { readonly kind: 'offline'; readonly id: string }

export const parseCarPlayItemId = (raw: string): CarPlayItemAction | null => {
  if (raw.startsWith('playlist:')) {
    const id = raw.slice('playlist:'.length)
    return id ? { kind: 'playlist', id } : null
  }
  if (raw.startsWith('artist:')) {
    const id = raw.slice('artist:'.length)
    return id ? { kind: 'artist', id } : null
  }
  if (raw.startsWith('offline:')) {
    const id = raw.slice('offline:'.length)
    return id ? { kind: 'offline', id } : null
  }
  return null
}

export const buildLibrarySections = (
  playlists: readonly LibraryItem[],
  artists: readonly LibraryItem[],
  offline: readonly OfflineEntry[],
): readonly CarPlayListSection[] => [
  {
    title: 'Playlists',
    items: playlists.map((item) => ({
      id: `playlist:${item.id}`,
      text: item.name,
      detailText: item.childCount ? `${item.childCount} tracks` : undefined,
    })),
  },
  {
    title: 'Artists',
    items: artists.slice(0, 40).map((item) => ({
      id: `artist:${item.id}`,
      text: item.name,
    })),
  },
  {
    title: 'Offline',
    items: offline.map((entry) => ({
      id: `offline:${entry.itemId}`,
      text: entry.title,
      detailText: entry.artist,
    })),
  },
]

export const tracksFromOffline = (
  offline: readonly OfflineEntry[],
): readonly QueueTrack[] =>
  offline.map((entry) => ({
    id: entry.itemId,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    durationMs: entry.durationMs,
    artworkUrl: entry.artworkPath,
  }))
