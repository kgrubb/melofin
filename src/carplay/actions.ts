import {
  buildAlbumItems,
  buildArtistDetailItems,
  buildArtistItems,
  buildOfflineItems,
  buildPlaylistItems,
  parseCarPlayItemId,
  tracksFromOffline,
  type CarPlayListItem,
} from '@/src/carplay/templates'
import { createListTemplate } from '@/src/carplay/nativeTemplates'
import { logger } from '@/src/logging/logger'
import type { QueueTrack } from '@/src/domain/queue'
import {
  artworkUrl,
  fetchAlbumsByArtist,
  fetchChildren,
  fetchPlaylistTracks,
  fetchSongsForArtist,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { CarPlay } from 'react-native-carplay'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

const onSelect = (itemId: string) => handleCarPlayItemPress(itemId)

const toQueue = (
  context: JellyfinContext,
  items: readonly LibraryItem[],
): readonly QueueTrack[] =>
  items.map((item) =>
    toQueueTrack(
      item,
      artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'hero'),
    ),
  )

const pushList = (title: string, items: readonly CarPlayListItem[], empty?: string) =>
  CarPlay.pushTemplate(createListTemplate(title, items, onSelect, empty).template, true)

const replaceList = (title: string, items: readonly CarPlayListItem[], empty?: string) => {
  CarPlay.popTemplate(true)
  pushList(title, items, empty)
}

const offlineEntries = () =>
  Object.values(useSettingsStore.getState().offlineIndex.entries)

const pushArtistDetail = async (
  context: JellyfinContext,
  userId: string,
  artistId: string,
  offset = 0,
) => {
  const artist = useLibraryStore.getState().artists.find((a) => a.id === artistId)
  const name = artist?.name ?? 'Artist'
  const albums = await fetchAlbumsByArtist(context, userId, artistId)
  if (!albums.ok) {
    logger.warn('CarPlay artist albums failed', { artistId })
    return
  }
  pushList(
    name,
    buildArtistDetailItems(artistId, name, albums.value, offset),
    'No albums',
  )
}

export const handleCarPlayItemPress = async (itemId: string): Promise<void> => {
  const action = parseCarPlayItemId(itemId)
  if (!action) return

  if (action.kind === 'offlineAll' || action.kind === 'offline') {
    const tracks = tracksFromOffline(offlineEntries())
    if (tracks.length === 0) return
    const start =
      action.kind === 'offlineAll'
        ? 0
        : tracks.findIndex((track) => track.id === action.id)
    if (start < 0) return
    usePlayerStore.getState().playQueue(tracks, start)
    return
  }

  if (action.kind === 'browse') {
    const library = useLibraryStore.getState()
    if (action.section === 'playlists') {
      pushList('Playlists', buildPlaylistItems(library.playlists), 'No playlists')
    } else if (action.section === 'albums') {
      pushList('Albums', buildAlbumItems(library.albums), 'No albums')
    } else if (action.section === 'artists') {
      pushList('Artists', buildArtistItems(library.artists), 'No artists')
    } else {
      pushList('Downloads', buildOfflineItems(offlineEntries()), 'Nothing downloaded')
    }
    return
  }

  if (action.kind === 'playlistsMore') {
    replaceList(
      'Playlists',
      buildPlaylistItems(useLibraryStore.getState().playlists, action.offset),
      'No playlists',
    )
    return
  }
  if (action.kind === 'albumsMore') {
    replaceList(
      'Albums',
      buildAlbumItems(useLibraryStore.getState().albums, action.offset),
      'No albums',
    )
    return
  }
  if (action.kind === 'artistsMore') {
    replaceList(
      'Artists',
      buildArtistItems(useLibraryStore.getState().artists, action.offset),
      'No artists',
    )
    return
  }

  const session = useSessionStore.getState()
  if (!session.context || !session.session) {
    logger.warn('CarPlay action skipped', { reason: 'no_session', kind: action.kind })
    return
  }
  const { context } = session
  const userId = session.session.userId
  const playQueue = usePlayerStore.getState().playQueue

  if (action.kind === 'artist') {
    await pushArtistDetail(context, userId, action.id)
    return
  }
  if (action.kind === 'artistAlbumsMore') {
    CarPlay.popTemplate(true)
    await pushArtistDetail(context, userId, action.artistId, action.offset)
    return
  }

  const result =
    action.kind === 'playlist'
      ? await fetchPlaylistTracks(context, userId, action.id)
      : action.kind === 'album'
        ? await fetchChildren(context, userId, action.id)
        : await fetchSongsForArtist(context, userId, action.id)
  if (!result.ok || result.value.length === 0) {
    logger.warn('CarPlay catalog empty', { id: action.id, kind: action.kind })
    return
  }
  playQueue(toQueue(context, result.value), 0)
}
