import { carplay } from '@/src/i18n/carplayCopy'
import { SearchTemplate, CarPlay } from 'react-native-carplay'
import type { LibraryItem } from '@/src/services/jellyfin/library'
import {
  artworkUrl,
  fetchAlbumsByArtist,
  fetchChildren,
  fetchPlaylistTracks,
  searchLibrary,
  toQueueTrack,
} from '@/src/services/jellyfin/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { pushCarPlayList, setCarPlayTrackBuffer } from '@/src/carplay/session'
import { buildArtistDetailItems, buildTrackListItems } from '@/src/carplay/templates'
import { logger } from '@/src/logging/logger'
import type { QueueTrack } from '@/src/domain/queue'

const searchDetail = (item: LibraryItem) => {
  if (item.type === 'Audio') return item.artists[0]
  if (item.type === 'MusicAlbum') return item.artists[0] ?? carplay.album()
  if (item.type === 'MusicArtist') return carplay.artist()
  return item.childCount ? carplay.songCount(item.childCount) : carplay.playlist()
}

const playOrBrowse = async (item: LibraryItem): Promise<void> => {
  const session = useSessionStore.getState()
  if (!session.context || !session.session) return
  const { context } = session
  const userId = session.session.userId
  const playQueue = usePlayerStore.getState().playQueue

  if (item.type === 'MusicArtist') {
    const albums = await fetchAlbumsByArtist(context, userId, item.id)
    if (!albums.ok) {
      logger.warn('CarPlay search artist failed', { id: item.id })
      return
    }
    pushCarPlayList(
      item.name,
      buildArtistDetailItems(item.id, item.name, albums.value),
      carplay.noAlbums(),
    )
    return
  }

  if (item.type === 'Audio') {
    playQueue(
      [
        toQueueTrack(
          item,
          artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'hero'),
        ),
      ],
      0,
    )
    return
  }

  const result =
    item.type === 'Playlist'
      ? await fetchPlaylistTracks(context, userId, item.id)
      : await fetchChildren(context, userId, item.id)
  if (!result.ok || result.value.length === 0) {
    logger.warn('CarPlay search empty', { id: item.id, type: item.type })
    return
  }

  const queue: readonly QueueTrack[] = result.value.map((track) =>
    toQueueTrack(
      track,
      artworkUrl(context, track.imageItemId ?? track.id, track.imageTag, 'hero'),
    ),
  )

  if (item.type === 'Playlist' || item.type === 'MusicAlbum') {
    const containerType = item.type === 'Playlist' ? 'playlist' : 'album'
    setCarPlayTrackBuffer(queue)
    pushCarPlayList(
      item.name,
      buildTrackListItems(containerType, item.id, result.value),
      carplay.noSongs(),
    )
    return
  }

  playQueue(queue, 0)
}

export const openCarPlaySearch = (): void => {
  const state = { results: [] as LibraryItem[], searchGen: 0 }
  CarPlay.pushTemplate(
    new SearchTemplate({
      onSearch: async (query) => {
        const gen = ++state.searchGen
        const session = useSessionStore.getState()
        if (!session.context || !session.session || !query.trim()) {
          if (gen !== state.searchGen) return []
          state.results = []
          return []
        }
        const result = await searchLibrary(
          session.context,
          session.session.userId,
          query,
        )
        if (gen !== state.searchGen) return []
        state.results = result.ok ? [...result.value] : []
        return state.results.map((item) => ({
          text: item.name,
          detailText: searchDetail(item),
          ...(item.imageTag
            ? {
                image: {
                  uri: artworkUrl(
                    session.context!,
                    item.imageItemId ?? item.id,
                    item.imageTag,
                    'thumb',
                  ),
                },
              }
            : {}),
        }))
      },
      onItemSelect: async ({ index }) => {
        const item = state.results[index]
        if (item) await playOrBrowse(item)
      },
    }),
    true,
  )
}
