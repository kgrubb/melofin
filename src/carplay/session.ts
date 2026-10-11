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
  buildLibraryHubSections,
  buildQueueItems,
  buildSearchExploreSections,
  CARPLAY_DEFAULT_MAX_ITEMS,
  patchCarPlayPlayingIndicators,
  trimSectionsToBudget,
  type CarPlayListItem,
  type CarPlaySection,
  type HomeMixRow,
} from '@/src/carplay/templates'
import { carPlayArtFor, carPlayMixArtworkUris } from '@/src/carplay/itemArt'
import { mapPool } from '@/src/domain/asyncPool'
import { queueViewTracks, type QueueTrack } from '@/src/domain/queue'
import { carplay } from '@/src/i18n/carplayCopy'
import { logger } from '@/src/logging/logger'
import { refreshLockScreenNowPlaying } from '@/src/player/engineLifecycle'
import {
  fetchFavoriteArtists,
  fetchFavoriteTracks,
  fetchLatestAlbums,
  fetchMusicGenresPreview,
  fetchRecentPlaylists,
  fetchRecentSongs,
  fetchResume,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { useHomeMixesStore } from '@/src/store/homeMixes'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

type PressHandler = (itemId: string) => void | Promise<void>
type SearchOpener = () => void
type NowPlayingHandler = (buttonId: string) => void | Promise<void>

type Handlers = {
  readonly press: PressHandler
  readonly search: SearchOpener
  readonly nowPlaying: NowPlayingHandler
  readonly playerUnsub: (() => void) | null
}

type Session = {
  readonly tabBar: TabBarTemplate | null
  readonly nowPlaying: NowPlayingTemplate | null
  readonly home: CarPlayListHandle | null
  readonly library: CarPlayListHandle | null
  readonly search: CarPlayListHandle | null
  readonly stack: readonly CarPlayListHandle[]
  readonly trackBuffer: readonly QueueTrack[]
  readonly latestAlbums: readonly LibraryItem[]
  readonly maxItems: number
  readonly homeGen: number
  readonly connected: boolean
}

const idleHandlers = (): Handlers => ({
  press: async () => undefined,
  search: () => undefined,
  nowPlaying: async () => undefined,
  playerUnsub: null,
})

const idleSession = (): Session => ({
  tabBar: null,
  nowPlaying: null,
  home: null,
  library: null,
  search: null,
  stack: [],
  trackBuffer: [],
  latestAlbums: [],
  maxItems: CARPLAY_DEFAULT_MAX_ITEMS,
  homeGen: 0,
  connected: false,
})

let handlers: Handlers = idleHandlers()
let session: Session = idleSession()

const patchHandlers = (patch: Partial<Handlers>): void => {
  handlers = { ...handlers, ...patch }
}

const patchSession = (patch: Partial<Session>): void => {
  session = { ...session, ...patch }
}

export const setCarPlayPressHandler = (fn: PressHandler): void => {
  patchHandlers({ press: fn })
}

export const setCarPlaySearchOpener = (fn: SearchOpener): void => {
  patchHandlers({ search: fn })
}

export const setCarPlayNowPlayingHandler = (fn: NowPlayingHandler): void => {
  patchHandlers({ nowPlaying: fn })
}

const stackTop = (): CarPlayListHandle | null =>
  session.stack[session.stack.length - 1] ?? null

/** Pushed Up Next list, if any (rebuilds on track change). */
let upNextHandle: CarPlayListHandle | null = null

const dropFromStack = (handle: CarPlayListHandle): void => {
  if (handle === upNextHandle) upNextHandle = null
  const index = session.stack.indexOf(handle)
  if (index >= 0) {
    patchSession({ stack: session.stack.slice(0, index) })
  }
}


const offlineEntries = () =>
  Object.values(useSettingsStore.getState().offlineIndex.entries)

const playingId = () => {
  const player = usePlayerStore.getState()
  return player.tracks[player.currentIndex]?.id
}

const handlePress = (itemId: string) => {
  if (itemId === 'action:search') {
    handlers.search()
    return
  }
  return handlers.press(itemId)
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

/** Last home sections shown (keeps local artwork across track changes). */
let homePainted: readonly CarPlaySection[] = []

const applyDecoratedSections = (
  handle: CarPlayListHandle | null,
  sections: readonly CarPlaySection[],
): void => {
  if (!handle) return
  handle.setSections(sections)
  if (handle === session.home) homePainted = sections
  const artGen = currentArtworkGeneration()
  void decorateArtwork(sections, artGen).then((decorated) => {
    if (!handle || artGen !== currentArtworkGeneration()) return
    const next = patchCarPlayPlayingIndicators(decorated, playingContext())
    handle.setSections(next)
    if (handle === session.home) homePainted = next
  })
}

const playingContext = () => {
  const player = usePlayerStore.getState()
  return {
    playingId: playingId(),
    trackBuffer: session.trackBuffer,
    currentIndex: player.currentIndex,
  }
}

const mixRows = (): readonly HomeMixRow[] =>
  Object.values(useHomeMixesStore.getState().byId).map((mix) => ({
    id: mix.id,
    title: mix.title,
    subtitle: mix.subtitle,
    artworkUris: carPlayMixArtworkUris(mix.tracks),
  }))

const homeFromCache = (): readonly CarPlaySection[] => {
  const library = useLibraryStore.getState()
  const downloadCount = offlineEntries().filter((entry) => entry.complete).length
  return trimSectionsToBudget(
    buildHomeSections(
      {
        mixes: mixRows(),
        playlists: library.playlists.slice(0, 8),
        latestAlbums: session.latestAlbums,
        favoriteTracks: library.songs.filter((song) => song.isFavorite).slice(0, 8),
        favoriteArtists: library.artists
          .filter((artist) => artist.isFavorite)
          .slice(0, 8),
        downloadCount,
        playingId: playingId(),
        artFor: carPlayArtFor,
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

  const latestAlbums = okValue(results[4]) ?? []
  patchSession({ latestAlbums })

  const downloadCount = offlineEntries().filter((entry) => entry.complete).length
  const sections = trimSectionsToBudget(
    buildHomeSections(
      {
        resume: okValue(results[0]),
        recent: okValue(results[1]),
        favoriteTracks: okValue(results[2]),
        favoriteArtists: okValue(results[3]),
        latestAlbums,
        playlists: okValue(results[5]),
        mixes: mixRows(),
        downloadCount,
        playingId: playingId(),
        artFor: carPlayArtFor,
      },
      session.maxItems,
    ),
    session.maxItems,
  )
  session.home.setSections(sections)
  homePainted = sections
  const artGen = currentArtworkGeneration()
  const decorated = await decorateArtwork(sections, artGen)
  if (gen !== session.homeGen || !session.home) return
  if (artGen === currentArtworkGeneration()) {
    const next = patchCarPlayPlayingIndicators(decorated, playingContext())
    session.home.setSections(next)
    homePainted = next
  }

  paintLibrary()

  if (session.search) {
    const explore = trimSectionsToBudget(
      buildSearchExploreSections(
        {
          genres: okValue(results[6]) ?? [],
          mixes: mixRows(),
          playlists:
            okValue(results[5]) ?? useLibraryStore.getState().playlists.slice(0, 8),
          artFor: carPlayArtFor,
        },
        session.maxItems,
      ),
      session.maxItems,
    )
    applyDecoratedSections(session.search, explore)
  }
}

const libraryFromCache = (): readonly CarPlaySection[] => {
  const downloadCount = offlineEntries().filter((entry) => entry.complete).length
  return buildLibraryHubSections(
    {
      recentAlbums: session.latestAlbums,
      downloadCount,
      artFor: carPlayArtFor,
    },
    session.maxItems,
  )
}

const paintLibrary = (): void => {
  if (!session.library) return
  applyDecoratedSections(session.library, libraryFromCache())
}

const publishListArt = (
  handle: CarPlayListHandle,
  items: readonly CarPlayListItem[],
): void => {
  const artGen = currentArtworkGeneration()
  void decorateArtwork([{ items }], artGen).then((decorated) => {
    if (!session.stack.includes(handle) || artGen !== currentArtworkGeneration()) {
      return
    }
    const next = decorated[0]?.items
    if (!next) return
    // Re-apply playing dots after art resolve so a mid-flight track change wins.
    const sections = patchCarPlayPlayingIndicators([{ items: next }], playingContext())
    handle.setSections(sections)
  })
}

export const pushCarPlayList = (
  title: string,
  items: readonly CarPlayListItem[],
  emptyTitle?: string,
  opts?: { readonly upNext?: boolean },
): CarPlayListHandle => {
  const handle = createListTemplate(title, items, handlePress, {
    emptyTitle,
    onDidDisappear: () => dropFromStack(handle),
  })
  try {
    CarPlay.pushTemplate(handle.template, true)
  } catch (cause) {
    logger.warn('CarPlay push failed', { cause, title })
    return handle
  }
  patchSession({ stack: [...session.stack, handle] })
  if (opts?.upNext) upNextHandle = handle
  publishListArt(handle, items)
  return handle
}

/** Pop to TabBar so album-art / Up Next open from a clean root. */
export const resetCarPlayNavigation = (): void => {
  try {
    CarPlay.popToRootTemplate(false)
  } catch {
    // Already at root.
  }
  upNextHandle = null
  patchSession({ stack: [] })
}

/** Push the shared Now Playing template after playback starts. */
export const showCarPlayNowPlaying = (): void => {
  if (!session.connected || !session.nowPlaying) return
  try {
    CarPlay.enableNowPlaying(true)
    CarPlay.pushTemplate(session.nowPlaying, true)
  } catch (cause) {
    logger.warn('CarPlay Now Playing present failed', { cause })
  }
}

/** Top pushed list, if any. Capture before awaits when replacing in place. */
export const getCarPlayStackTop = (): CarPlayListHandle | null => stackTop()

export const replaceCarPlayList = (
  _title: string,
  items: readonly CarPlayListItem[],
  _emptyTitle?: string,
  expected?: CarPlayListHandle,
): void => {
  if (expected) {
    if (!session.stack.includes(expected)) return
    expected.setItems(items)
    publishListArt(expected, items)
    return
  }
  const top = stackTop()
  if (!top) return
  top.setItems(items)
  publishListArt(top, items)
}

export const setCarPlayTrackBuffer = (tracks: readonly QueueTrack[]): void => {
  patchSession({ trackBuffer: tracks })
}

export const getCarPlayTrackBuffer = (): readonly QueueTrack[] =>
  session.trackBuffer

export const isCarPlaySessionConnected = (): boolean => session.connected

const settle = (run: () => void | Promise<void>): void => {
  void Promise.resolve(run()).catch((cause) => {
    logger.warn('CarPlay action failed', { cause })
  })
}

const nowPlayingConfig = () => ({
  albumArtistButtonEnabled: true,
  upNextButtonEnabled: true,
  upNextButtonTitle: carplay.upNext(),
  buttons: [
    { id: 'shuffle', type: 'shuffle' as const },
    { id: 'repeat', type: 'repeat' as const },
    {
      id: 'favorite',
      type: 'image' as const,
      image: require('../../assets/carplay/heart.png'),
    },
    {
      id: 'radio',
      type: 'image' as const,
      image: require('../../assets/carplay/radio.png'),
    },
  ],
  onUpNextButtonPressed: () => settle(() => handlers.press('action:upNext')),
  onAlbumArtistButtonPressed: () =>
    settle(() => handlers.press('action:albumArtist')),
  onButtonPressed: ({ id }: { id: string }) =>
    settle(() => handlers.nowPlaying(id)),
})

const configureNowPlaying = (): void => {
  try {
    CarPlay.enableNowPlaying(true)
    const config = nowPlayingConfig()
    if (!session.nowPlaying) {
      patchSession({ nowPlaying: new NowPlayingTemplate(config) })
      return
    }
    // Reconnect clears CPNowPlayingTemplate buttons. Re-create on the same JS id
    // so buttonPressed still matches existing listeners.
    CarPlay.bridge.createTemplate(
      session.nowPlaying.id,
      session.nowPlaying.parseConfig({ type: 'nowplaying', ...config }),
    )
  } catch (cause) {
    logger.warn('CarPlay Now Playing config failed', { cause })
  }
}

const rebuildUpNext = (): void => {
  if (!upNextHandle || !session.stack.includes(upNextHandle)) return
  const player = usePlayerStore.getState()
  const items = buildQueueItems(queueViewTracks(player), 0)
  upNextHandle.setItems(items)
  publishListArt(upNextHandle, items)
}

const refreshCarPlayPlayingIndicators = (): void => {
  if (!session.connected) return
  try {
    const ctx = playingContext()
    if (session.home) {
      if (homePainted.length === 0) {
        applyDecoratedSections(session.home, homeFromCache())
      } else {
        const next = patchCarPlayPlayingIndicators(homePainted, ctx)
        if (next !== homePainted) {
          homePainted = next
          session.home.setSections(next)
        }
      }
    }
    if (upNextHandle && session.stack.includes(upNextHandle)) {
      rebuildUpNext()
    }
    for (const handle of session.stack) {
      if (handle === upNextHandle) continue
      const current = handle.getSections()
      const next = patchCarPlayPlayingIndicators(current, ctx)
      if (next !== current) handle.setSections(next)
    }
  } catch (cause) {
    logger.warn('CarPlay playing indicator refresh failed', { cause })
  }
}

const wirePlayerUpdates = (): void => {
  handlers.playerUnsub?.()
  const playerKey = () => {
    const player = usePlayerStore.getState()
    return `${player.tracks[player.currentIndex]?.id ?? ''}:${player.currentIndex}`
  }
  let lastKey = playerKey()
  patchHandlers({
    playerUnsub: usePlayerStore.subscribe(() => {
      const nextKey = playerKey()
      if (nextKey === lastKey) return
      lastKey = nextKey
      refreshCarPlayPlayingIndicators()
    }),
  })
}

const clearLiveTemplates = (): void => {
  handlers.playerUnsub?.()
  patchHandlers({ playerUnsub: null })
  homePainted = []
  upNextHandle = null
  patchSession({
    connected: false,
    tabBar: null,
    home: null,
    library: null,
    search: null,
    stack: [],
  })
}

export const connectCarPlaySession = (): void => {
  try {
    bumpArtworkGeneration()

    // Root first so CarPlay is not left on a blank scene if Now Playing setup throws.
    const home = createListTemplate(carplay.home(), [], handlePress, {
      tabTitle: carplay.home(),
      tabSystemImageName: 'house.fill',
      emptyTitle: carplay.home(),
    })
    const library = createListTemplate(carplay.library(), [], handlePress, {
      tabTitle: carplay.library(),
      tabSystemImageName: 'rectangle.stack.fill',
      emptyTitle: carplay.noPlaylists(),
    })
    const search = createListTemplate(carplay.search(), [], handlePress, {
      tabTitle: carplay.search(),
      tabSystemImageName: 'magnifyingglass',
      emptyTitle: carplay.searchHint(),
      trailingNavigationBarButtons: [
        { id: 'action:search', type: 'text', title: carplay.search() },
      ],
    })

    patchSession({
      home,
      library,
      search,
      stack: [],
      trackBuffer: [],
      latestAlbums: [],
      connected: true,
      tabBar: null,
    })

    void home.getMaximumListItemCount().then((count) => {
      if (Number.isFinite(count) && count > 0) {
        patchSession({ maxItems: count })
      }
    })

    applyDecoratedSections(home, homeFromCache())
    paintLibrary()
    applyDecoratedSections(
      search,
      buildSearchExploreSections({
        mixes: mixRows(),
        playlists: useLibraryStore.getState().playlists.slice(0, 8),
        artFor: carPlayArtFor,
      }),
    )

    const tabBar = new TabBarTemplate({
      templates: [home.template, library.template, search.template],
      // Search opens from the tab row / bar button only (auto-push fought tab switches).
      onTemplateSelect: () => undefined,
    })
    CarPlay.setRootTemplate(tabBar)
    configureNowPlaying()
    refreshLockScreenNowPlaying()

    const homeGen = session.homeGen + 1
    patchSession({ tabBar, homeGen })
    void refreshHome(homeGen)
    wirePlayerUpdates()
  } catch (cause) {
    logger.warn('CarPlay connect failed', { cause })
    clearLiveTemplates()
  }
}

export const syncCarPlaySession = (): void => {
  if (!session.connected || !CarPlay.connected) return
  try {
    // Patch in place only. Avoid refreshHome here (it reopened Library in a loop).
    paintLibrary()
    if (session.home) {
      applyDecoratedSections(session.home, homeFromCache())
    }
  } catch (cause) {
    logger.warn('CarPlay sync failed', { cause })
  }
}

export const disconnectCarPlaySession = (): void => {
  clearLiveTemplates()
  bumpArtworkGeneration()
  clearArtworkCache()
  patchSession({ trackBuffer: [], latestAlbums: [] })
}
