import {
  parseCarPlayItemId,
  tracksFromOffline,
} from '@/src/carplay/templates'
import { logger } from '@/src/logging/logger'
import type { QueueTrack } from '@/src/domain/queue'
import {
  artworkUrl,
  fetchPlaylistTracks,
  fetchSongsForArtist,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
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

  if (action.kind === 'offline') {
    const entry = useSettingsStore.getState().offlineIndex.entries[action.id]
    if (!entry?.complete) return
    playQueue(tracksFromOffline([entry]), 0)
    return
  }

  const result =
    action.kind === 'playlist'
      ? await fetchPlaylistTracks(context, userId, action.id)
      : await fetchSongsForArtist(context, userId, action.id)
  if (!result.ok || result.value.length === 0) {
    logger.warn('CarPlay catalog empty', { id: action.id, kind: action.kind })
    return
  }
  playQueue(toQueue(context, result.value), 0)
}
