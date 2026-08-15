import {
  buildLibrarySections,
  parseCarPlayItemId,
  tracksFromOffline,
} from '@/src/carplay/templates'
import { createBrowseTemplate } from '@/src/carplay/nativeTemplates'
import { logger } from '@/src/logging/logger'
import type { QueueTrack } from '@/src/domain/queue'
import {
  artworkUrl,
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

let artistsPageOffset = 0
let albumsPageOffset = 0

const pushPagedRoot = (artistsOffset: number, albumsOffset: number) => {
  const library = useLibraryStore.getState()
  const offline = Object.values(useSettingsStore.getState().offlineIndex.entries)
  const template = createBrowseTemplate(
    buildLibrarySections(
      library.playlists,
      library.artists,
      offline,
      library.albums,
      { artistsOffset, albumsOffset },
    ),
    (itemId) => {
      void handleCarPlayItemPress(itemId)
    },
  )
  const api = CarPlay as typeof CarPlay & {
    setRootTemplate?: (template: unknown) => void
  }
  api.setRootTemplate?.(template)
}

export const handleCarPlayItemPress = async (itemId: string): Promise<void> => {
  const action = parseCarPlayItemId(itemId)
  if (!action) return
  const session = useSessionStore.getState()
  const playQueue = usePlayerStore.getState().playQueue
  if (!session.context || !session.session) {
    logger.warn('CarPlay play skipped', { reason: 'no_session' })
    return
  }
  const { context } = session
  const userId = session.session.userId

  if (action.kind === 'artistsMore') {
    artistsPageOffset = action.offset
    pushPagedRoot(artistsPageOffset, albumsPageOffset)
    return
  }
  if (action.kind === 'albumsMore') {
    albumsPageOffset = action.offset
    pushPagedRoot(artistsPageOffset, albumsPageOffset)
    return
  }

  if (action.kind === 'offlineAll' || action.kind === 'offline') {
    const entries = Object.values(
      useSettingsStore.getState().offlineIndex.entries,
    )
    const tracks = tracksFromOffline(entries)
    if (tracks.length === 0) return
    if (action.kind === 'offlineAll') {
      playQueue(tracks, 0)
      return
    }
    const start = tracks.findIndex((t) => t.id === action.id)
    if (start < 0) return
    playQueue(tracks, start)
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
