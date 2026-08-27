import { carplay } from '@/src/i18n/carplayCopy'
import { SearchTemplate, CarPlay, type ListItem } from 'react-native-carplay'
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
import { presentCarPlayNotice } from '@/src/carplay/feedback'
import { pushCarPlayList, showCarPlayNowPlaying } from '@/src/carplay/session'
import { orderSearchResults } from '@/src/carplay/searchOrder'
import { buildArtistDetailItems } from '@/src/carplay/templates'
import { carPlayArtFor } from '@/src/carplay/itemArt'
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
  if (!session.context || !session.session) {
    presentCarPlayNotice(carplay.unavailable())
    return
  }
  const { context } = session
  const userId = session.session.userId
  const playQueue = usePlayerStore.getState().playQueue

  if (item.type === 'MusicArtist') {
    const albums = await fetchAlbumsByArtist(context, userId, item.id)
    if (!albums.ok) {
      logger.warn('CarPlay search artist failed', { id: item.id })
      presentCarPlayNotice(carplay.unavailable())
      return
    }
    if (albums.value.length === 0) {
      presentCarPlayNotice(carplay.noAlbums())
      return
    }
    pushCarPlayList(
      item.name,
      buildArtistDetailItems(item.id, item.name, albums.value, 0, carPlayArtFor),
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
    showCarPlayNowPlaying()
    return
  }

  const result =
    item.type === 'Playlist'
      ? await fetchPlaylistTracks(context, userId, item.id)
      : await fetchChildren(context, userId, item.id)
  if (!result.ok) {
    logger.warn('CarPlay search load failed', { id: item.id, type: item.type })
    presentCarPlayNotice(carplay.unavailable())
    return
  }
  if (result.value.length === 0) {
    logger.warn('CarPlay search empty', { id: item.id, type: item.type })
    presentCarPlayNotice(carplay.nothingToPlay())
    return
  }

  const queue: readonly QueueTrack[] = result.value.map((track) =>
    toQueueTrack(
      track,
      artworkUrl(context, track.imageItemId ?? track.id, track.imageTag, 'hero'),
    ),
  )
  playQueue(queue, 0)
  showCarPlayNowPlaying()
}

let searchOpen = false

/** Clears the open guard (disconnect / root rebuild). */
export const resetCarPlaySearchOpen = (): void => {
  searchOpen = false
}

export const openCarPlaySearch = (): void => {
  if (searchOpen) return
  searchOpen = true
  const state = { results: [] as LibraryItem[], searchGen: 0 }
  const template = new SearchTemplate({
      // didDisappear keeps the open guard while Now Playing covers Search.
      onDidDisappear: () => {
        searchOpen = false
      },
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
        if (!result.ok) {
          logger.warn('CarPlay search failed', { query })
          state.results = []
          return []
        }
        state.results = [...orderSearchResults(result.value)]
        return state.results.map((item) => {
          const uri = artworkUrl(
            session.context!,
            item.imageItemId ?? item.id,
            item.imageTag,
            'thumb',
          )
          // Runtime accepts imgUrl URLs; typings mark it null-only.
          return {
            text: item.name,
            detailText: searchDetail(item),
            ...(uri ? { imgUrl: uri } : {}),
          } as ListItem
        })
      },
      onItemSelect: async ({ index }) => {
        try {
          const item = state.results[index]
          if (item) await playOrBrowse(item)
        } catch (cause) {
          logger.warn('CarPlay select failed', { cause, index })
          presentCarPlayNotice(carplay.unavailable())
        }
      },
    })
  try {
    CarPlay.pushTemplate(template, true)
  } catch (cause) {
    searchOpen = false
    logger.warn('CarPlay search present failed', { cause })
  }
}
