import {
  CarPlay,
  NowPlayingTemplate,
  TabBarTemplate,
} from 'react-native-carplay'
import {
  bumpArtworkGeneration,
  clearArtworkCache,
  currentArtworkGeneration,
  resolveCarPlayArtwork,
} from '@/src/carplay/artwork'
import {
  createListTemplate,
  type CarPlayListHandle,
} from '@/src/carplay/nativeTemplates'
import {
  buildHomeSections,
  buildLibraryHubItems,
  buildQueueItems,
  buildSearchExploreSections,
  CARPLAY_DEFAULT_MAX_ITEMS,
  trimSectionsToBudget,
  type CarPlayListItem,
  type CarPlaySection,
  type HomeMixRow,
} from '@/src/carplay/templates'
import { mapPool } from '@/src/domain/asyncPool'
import type { QueueTrack } from '@/src/domain/queue'
import { carplay } from '@/src/i18n/carplayCopy'
import { logger } from '@/src/logging/logger'
import {
  artworkUrl,
  fetchFavoriteArtists,
  fetchFavoriteTracks,
  fetchLatestAlbums,
  fetchMusicGenresPreview,
  fetchRecentPlaylists,
  fetchRecentSongs,
  fetchResume,
} from '@/src/services/jellyfin/library'
import { useHomeMixesStore } from '@/src/store/homeMixes'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

type PressHandler = (itemId: string) => void | Promise<void>
type SearchOpener = () => void
type NowPlayingHandler = (buttonId: string) => void | Promise<void>

let pressHandler: PressHandler = async () => undefined
let searchOpener: SearchOpener = () => undefined
let nowPlayingHandler: NowPlayingHandler = async () => undefined

export const setCarPlayPressHandler = (fn: PressHandler): void => {
  pressHandler = fn
}

export const setCarPlaySearchOpener = (fn: SearchOpener): void => {
  searchOpener = fn
}

export const setCarPlayNowPlayingHandler = (fn: NowPlayingHandler): void => {
  nowPlayingHandler = fn
}

type Session = {
  tabBar: TabBarTemplate | null
  nowPlaying: NowPlayingTemplate | null
  home: CarPlayListHandle | null
  library: CarPlayListHandle | null
  search: CarPlayListHandle | null
  stackTop: CarPlayListHandle | null
  trackBuffer: readonly QueueTrack[]
  maxItems: number
  homeGen: number
  connected: boolean
}

const session: Session = {
  tabBar: null,
  nowPlaying: null,
  home: null,
  library: null,
  search: null,
  stackTop: null,
  trackBuffer: [],
  maxItems: CARPLAY_DEFAULT_MAX_ITEMS,
  homeGen: 0,
  connected: false,
}

const offlineEntries = () =>
  Object.values(useSettingsStore.getState().offlineIndex.entries)

const playingId = () => {
  const player = usePlayerStore.getState()
  return player.tracks[player.currentIndex]?.id
}

const handlePress = (itemId: string) => {
  if (itemId === 'action:search') {
    searchOpener()
    return
  }
  return pressHandler(itemId)
}

const decorateArtwork = async (
  sections: readonly CarPlaySection[],
  generation: number,
): Promise<readonly CarPlaySection[]> =>
  mapPool(sections, 2, async (section) => {
    const items = await mapPool(section.items, 4, async (item) => {
      if (generation !== currentArtworkGeneration()) return item
      if (item.imageRowUris && item.imageRowUris.length > 0) {
        const uris = await mapPool(item.imageRowUris, 4, async (uri) => {
          const resolved = await resolveCarPlayArtwork({
            uri,
            edge: 90,
            generation,
          })
          return resolved ?? uri
        })
        if (generation !== currentArtworkGeneration()) return item
        return { ...item, imageRowUris: uris }
      }
      if (!item.artworkUri) return item
      const resolved = await resolveCarPlayArtwork({
        uri: item.artworkUri,
        edge: 90,
        generation,
      })
      if (generation !== currentArtworkGeneration() || !resolved) return item
      return { ...item, artworkUri: resolved }
    })
    return { header: section.header, items }
  })

const mixRows = (): readonly HomeMixRow[] => {
  const mixes = Object.values(useHomeMixesStore.getState().byId)
  const context = useSessionStore.getState().context
  return mixes.map((mix) => {
    const artworkUris =
      context && mix.tracks.length > 0
        ? mix.tracks
            .slice(0, 8)
            .map(
              (track) =>
                artworkUrl(
                  context,
                  track.imageItemId ?? track.id,
                  track.imageTag,
                  'thumb',
                ) ?? '',
            )
            .filter(Boolean)
        : []
    return {
      id: mix.id,
      title: mix.title,
      subtitle: mix.subtitle,
      artworkUris,
    }
  })
}

const homeFromCache = (): readonly CarPlaySection[] => {
  const library = useLibraryStore.getState()
  const downloadCount = offlineEntries().filter((entry) => entry.complete).length
  return trimSectionsToBudget(
    buildHomeSections(
      {
        mixes: mixRows(),
        playlists: library.playlists.slice(0, 8),
        latestAlbums: library.albums.slice(0, 8),
        favoriteTracks: library.songs.filter((song) => song.isFavorite).slice(0, 8),
        favoriteArtists: library.artists
          .filter((artist) => artist.isFavorite)
          .slice(0, 8),
        downloadCount,
        playingId: playingId(),
      },
      session.maxItems,
    ),
    session.maxItems,
  )
}

const okValue = <T,>(
  result: { ok: true; value: T } | { ok: false } | null | undefined,
): T | undefined => (result && result.ok ? result.value : undefined)

const refreshHome = async (gen: number): Promise<void> => {
  const { context, session: account } = useSessionStore.getState()
  if (!context || !account || !session.home) return
  const userId = account.userId

  const keys = [
    'resume',
    'recent',
    'favorites',
    'artists',
    'latest',
    'playlists',
    'genres',
  ] as const

  const results = await mapPool(keys, 3, async (key) => {
    if (gen !== session.homeGen) return null
    switch (key) {
      case 'resume':
        return fetchResume(context, userId)
      case 'recent':
        return fetchRecentSongs(context, userId)
      case 'favorites':
        return fetchFavoriteTracks(context, userId)
      case 'artists':
        return fetchFavoriteArtists(context, userId)
      case 'latest':
        return fetchLatestAlbums(context, userId)
      case 'playlists':
        return fetchRecentPlaylists(context, userId)
      case 'genres':
        return fetchMusicGenresPreview(context, userId)
      default:
        return null
    }
  })

  if (gen !== session.homeGen || !session.home) return

  const downloadCount = offlineEntries().filter((entry) => entry.complete).length
  const sections = trimSectionsToBudget(
    buildHomeSections(
      {
        resume: okValue(results[0]),
        recent: okValue(results[1]),
        favoriteTracks: okValue(results[2]),
        favoriteArtists: okValue(results[3]),
        latestAlbums: okValue(results[4]),
        playlists: okValue(results[5]),
        mixes: mixRows(),
        downloadCount,
        playingId: playingId(),
      },
      session.maxItems,
    ),
    session.maxItems,
  )
  session.home.setSections(sections)
  const artGen = currentArtworkGeneration()
  const decorated = await decorateArtwork(sections, artGen)
  if (gen !== session.homeGen || !session.home) return
  if (artGen === currentArtworkGeneration()) {
    session.home.setSections(decorated)
  }

  if (session.search) {
    const explore = trimSectionsToBudget(
      buildSearchExploreSections(
        {
          genres: okValue(results[6]) ?? [],
          mixes: mixRows(),
          playlists:
            okValue(results[5]) ?? useLibraryStore.getState().playlists.slice(0, 8),
        },
        session.maxItems,
      ),
      session.maxItems,
    )
    session.search.setSections(explore)
    const searchArt = await decorateArtwork(explore, artGen)
    if (session.search && artGen === currentArtworkGeneration()) {
      session.search.setSections(searchArt)
    }
  }
}

const paintLibrary = (): void => {
  if (!session.library) return
  session.library.setItems(buildLibraryHubItems(offlineEntries()))
}

export const pushCarPlayList = (
  title: string,
  items: readonly CarPlayListItem[],
  emptyTitle?: string,
): CarPlayListHandle => {
  const handle = createListTemplate(title, items, handlePress, { emptyTitle })
  session.stackTop = handle
  CarPlay.pushTemplate(handle.template, true)
  return handle
}

export const replaceCarPlayList = (
  _title: string,
  items: readonly CarPlayListItem[],
  emptyTitle?: string,
): void => {
  if (session.stackTop) {
    session.stackTop.setItems(items)
    return
  }
  pushCarPlayList(_title, items, emptyTitle)
}

export const setCarPlayTrackBuffer = (tracks: readonly QueueTrack[]): void => {
  session.trackBuffer = tracks
}

export const getCarPlayTrackBuffer = (): readonly QueueTrack[] =>
  session.trackBuffer

export const isCarPlaySessionConnected = (): boolean => session.connected

const configureNowPlaying = (): void => {
  try {
    CarPlay.enableNowPlaying(true)
    if (session.nowPlaying) return
    session.nowPlaying = new NowPlayingTemplate({
      albumArtistButtonEnabled: true,
      upNextButtonEnabled: true,
      upNextButtonTitle: carplay.upNext(),
      buttons: [
        { id: 'shuffle', type: 'shuffle' },
        { id: 'repeat', type: 'repeat' },
        {
          id: 'favorite',
          type: 'image',
          image: require('../../assets/carplay/heart.png'),
        },
        {
          id: 'radio',
          type: 'image',
          image: require('../../assets/carplay/radio.png'),
        },
      ],
      onUpNextButtonPressed: () => {
        void pressHandler('action:upNext')
      },
      onAlbumArtistButtonPressed: () => {
        void pressHandler('action:albumArtist')
      },
      onButtonPressed: ({ id }) => {
        void nowPlayingHandler(id)
      },
    })
  } catch (cause) {
    logger.warn('CarPlay Now Playing config failed', { cause })
  }
}

export const connectCarPlaySession = (): void => {
  try {
    session.connected = true
    bumpArtworkGeneration()

    // Root template first so CarPlay is never left on a blank scene if NP setup throws.
    session.home = createListTemplate(carplay.home(), [], handlePress, {
      tabTitle: carplay.home(),
      tabSystemImageName: 'house.fill',
      emptyTitle: carplay.home(),
    })
    session.library = createListTemplate(carplay.library(), [], handlePress, {
      tabTitle: carplay.library(),
      tabSystemImageName: 'rectangle.stack.fill',
      emptyTitle: carplay.noPlaylists(),
    })
    session.search = createListTemplate(carplay.search(), [], handlePress, {
      tabTitle: carplay.search(),
      tabSystemImageName: 'magnifyingglass',
      emptyTitle: carplay.searchHint(),
      trailingNavigationBarButtons: [
        { id: 'action:search', type: 'text', title: carplay.search() },
      ],
    })

    void session.home.getMaximumListItemCount().then((count) => {
      if (Number.isFinite(count) && count > 0) {
        session.maxItems = count
      }
    })

    session.home.setSections(homeFromCache())
    paintLibrary()
    session.search.setSections(
      buildSearchExploreSections({
        mixes: mixRows(),
        playlists: useLibraryStore.getState().playlists.slice(0, 8),
      }),
    )

    session.tabBar = new TabBarTemplate({
      templates: [
        session.home.template,
        session.library.template,
        session.search.template,
      ],
      onTemplateSelect: () => undefined,
    })
    CarPlay.setRootTemplate(session.tabBar)
    configureNowPlaying()

    session.homeGen += 1
    void refreshHome(session.homeGen)
  } catch (cause) {
    logger.warn('CarPlay connect failed', { cause })
  }
}

export const syncCarPlaySession = (): void => {
  if (!session.connected || !CarPlay.connected) return
  try {
    paintLibrary()
    if (session.home) {
      session.home.setSections(homeFromCache())
    }
    if (session.stackTop && session.trackBuffer.length > 0) {
      const player = usePlayerStore.getState()
      session.stackTop.setItems(
        buildQueueItems(session.trackBuffer, player.currentIndex),
      )
    }
    session.homeGen += 1
    void refreshHome(session.homeGen)
  } catch (cause) {
    logger.warn('CarPlay sync failed', { cause })
  }
}

export const disconnectCarPlaySession = (): void => {
  session.connected = false
  bumpArtworkGeneration()
  clearArtworkCache()
  session.tabBar = null
  session.nowPlaying = null
  session.home = null
  session.library = null
  session.search = null
  session.stackTop = null
  session.trackBuffer = []
}
