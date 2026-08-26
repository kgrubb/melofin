import {
  getCarPlayTrackBuffer,
  pushCarPlayList,
  replaceCarPlayList,
  resetCarPlayNavigation,
  setCarPlayNowPlayingHandler,
  setCarPlayPressHandler,
  setCarPlaySearchOpener,
  setCarPlayTrackBuffer,
} from '@/src/carplay/session'
import { openCarPlaySearch } from '@/src/carplay/search'
import { presentCarPlayNotice } from '@/src/carplay/feedback'
import { carPlayArtFor, carPlayMixArtworkUris } from '@/src/carplay/itemArt'
import {
  buildAlbumItems,
  buildArtistDetailItems,
  buildArtistItems,
  buildGenreItems,
  buildOfflineItems,
  buildPlaylistItems,
  buildQueueItems,
  buildSongItems,
  buildTrackListItems,
  mixRow,
  parseCarPlayItemId,
  tracksFromOffline,
} from '@/src/carplay/templates'
import { logger } from '@/src/logging/logger'
import type { QueueTrack } from '@/src/domain/queue'
import {
  artworkUrl,
  fetchAlbumsByArtist,
  fetchChildren,
  fetchFavoriteTracks,
  fetchInstantMixFromGenre,
  fetchInstantMixFromGenreName,
  fetchItem,
  fetchMusicGenresPreview,
  fetchPlaylistTracks,
  fetchRandomSongs,
  fetchSongsForArtist,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { toggleFavoriteItem } from '@/src/services/jellyfin/favoriteToggle'
import { startRadioFromItem } from '@/src/player/startRadio'
import { useHomeMixesStore } from '@/src/store/homeMixes'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { carplay } from '@/src/i18n/carplayCopy'
import { melofinRootUri } from '@/src/storage/jsonFile'

type TrackListContext = {
  readonly title: string
  readonly containerType: 'album' | 'playlist'
  readonly containerId: string
  readonly tracks: readonly LibraryItem[]
}

let trackListContext: TrackListContext | null = null
let genreCache: readonly LibraryItem[] = []

const offlineEntries = () =>
  Object.values(useSettingsStore.getState().offlineIndex.entries)

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

const playingId = () => {
  const player = usePlayerStore.getState()
  return player.tracks[player.currentIndex]?.id
}

const playTracks = (
  tracks: readonly QueueTrack[],
  startIndex = 0,
  shuffle = false,
) => {
  if (tracks.length === 0) {
    presentCarPlayNotice(carplay.nothingToPlay())
    return
  }
  usePlayerStore.getState().playQueue(tracks, startIndex, null, shuffle)
}

const noticeLoad = (ok: boolean): void => {
  presentCarPlayNotice(ok ? carplay.nothingToPlay() : carplay.unavailable())
}

const openTrackList = (
  title: string,
  containerType: 'album' | 'playlist',
  containerId: string,
  tracks: readonly LibraryItem[],
  context: JellyfinContext,
) => {
  trackListContext = { title, containerType, containerId, tracks }
  setCarPlayTrackBuffer(toQueue(context, tracks))
  pushCarPlayList(
    title,
    buildTrackListItems(
      containerType,
      containerId,
      tracks,
      0,
      playingId(),
      carPlayArtFor,
    ),
    carplay.noSongs(),
  )
}

const pushArtistDetail = async (
  context: JellyfinContext,
  userId: string,
  artistId: string,
  offset = 0,
  replace = false,
): Promise<boolean> => {
  const artist = useLibraryStore.getState().artists.find((entry) => entry.id === artistId)
  const name = artist?.name ?? carplay.artist()
  const albums = await fetchAlbumsByArtist(context, userId, artistId)
  if (!albums.ok) {
    logger.warn('CarPlay artist albums failed', { artistId })
    presentCarPlayNotice(carplay.unavailable())
    return false
  }
  const items = buildArtistDetailItems(
    artistId,
    name,
    albums.value,
    offset,
    carPlayArtFor,
  )
  if (replace) replaceCarPlayList(name, items, carplay.noAlbums())
  else pushCarPlayList(name, items, carplay.noAlbums())
  return true
}

const openUpNext = () => {
  const player = usePlayerStore.getState()
  resetCarPlayNavigation()
  setCarPlayTrackBuffer(player.tracks)
  pushCarPlayList(carplay.upNext(), buildQueueItems(player.tracks, player.currentIndex))
}

const openAlbumArtist = async () => {
  const player = usePlayerStore.getState()
  const track = player.tracks[player.currentIndex]
  const account = useSessionStore.getState()
  if (!track || !account.context || !account.session) {
    logger.warn('CarPlay album/artist skipped', { reason: 'no_track_or_session' })
    return
  }
  // Clear a prior album/up-next push so a second album-art tap does not stack blanks.
  resetCarPlayNavigation()

  if (track.albumId) {
    const result = await fetchChildren(
      account.context,
      account.session.userId,
      track.albumId,
    )
    if (result.ok && result.value.length > 0) {
      openTrackList(
        track.album || carplay.album(),
        'album',
        track.albumId,
        result.value,
        account.context,
      )
      return
    }
  }
  if (track.artistId) {
    await pushArtistDetail(
      account.context,
      account.session.userId,
      track.artistId,
    )
    return
  }
  logger.warn('CarPlay album/artist skipped', { reason: 'no_album_or_artist' })
}

const handleNowPlaying = async (buttonId: string): Promise<void> => {
  if (buttonId === 'shuffle') {
    usePlayerStore.getState().toggleShuffle()
    return
  }
  if (buttonId === 'repeat') {
    usePlayerStore.getState().cycleRepeat()
    return
  }
  if (buttonId === 'favorite') {
    const session = useSessionStore.getState()
    const player = usePlayerStore.getState()
    const track = player.tracks[player.currentIndex]
    if (!session.context || !session.session || !track) return
    await toggleFavoriteItem({
      context: session.context,
      userId: session.session.userId,
      itemId: track.id,
      currentlyFavorite: Boolean(track.isFavorite),
    })
    return
  }
  if (buttonId === 'radio') {
    const player = usePlayerStore.getState()
    const track = player.tracks[player.currentIndex]
    if (!track) return
    await startRadioFromItem(track.id, track.artistId)
  }
}

export const handleCarPlayItemPress = async (itemId: string): Promise<void> => {
  if (itemId === 'action:upNext') {
    openUpNext()
    return
  }
  if (itemId === 'action:albumArtist') {
    await openAlbumArtist()
    return
  }

  const action = parseCarPlayItemId(itemId)
  if (!action) return

  if (action.kind === 'offlineAll' || action.kind === 'offline') {
    const tracks = tracksFromOffline(offlineEntries(), melofinRootUri())
    if (tracks.length === 0) return
    const start =
      action.kind === 'offlineAll'
        ? 0
        : tracks.findIndex((track) => track.id === action.id)
    if (start < 0) return
    playTracks(tracks, start)
    return
  }

  if (action.kind === 'search') {
    openCarPlaySearch()
    return
  }

  if (action.kind === 'queue') {
    const player = usePlayerStore.getState()
    playTracks(player.tracks, action.index)
    return
  }

  if (action.kind === 'trackAt') {
    const buffer = getCarPlayTrackBuffer()
    if (buffer.length === 0) return
    playTracks(buffer, action.index)
    return
  }

  if (action.kind === 'browse') {
    const library = useLibraryStore.getState()
    if (action.section === 'playlists') {
      pushCarPlayList(
        carplay.playlists(),
        buildPlaylistItems(library.playlists, 0, carPlayArtFor),
        carplay.noPlaylists(),
      )
    } else if (action.section === 'albums') {
      pushCarPlayList(
        carplay.albums(),
        buildAlbumItems(library.albums, 0, carPlayArtFor),
        carplay.noAlbums(),
      )
    } else if (action.section === 'artists') {
      pushCarPlayList(
        carplay.artists(),
        buildArtistItems(library.artists, 0, carPlayArtFor),
        carplay.noArtists(),
      )
    } else if (action.section === 'songs') {
      pushCarPlayList(
        carplay.songs(),
        buildSongItems(library.songs, 0, playingId(), carPlayArtFor),
        carplay.noSongs(),
      )
    } else if (action.section === 'genres') {
      genreCache = []
      pushCarPlayList(carplay.genres(), buildGenreItems([]), carplay.noGenres())
      const session = useSessionStore.getState()
      if (session.context && session.session) {
        const genres = await fetchMusicGenresPreview(
          session.context,
          session.session.userId,
        )
        if (genres.ok) {
          genreCache = genres.value
          replaceCarPlayList(
            carplay.genres(),
            buildGenreItems(genreCache),
            carplay.noGenres(),
          )
        } else {
          presentCarPlayNotice(carplay.unavailable())
        }
      }
    } else if (action.section === 'mixes') {
      const mixes = Object.values(useHomeMixesStore.getState().byId)
      pushCarPlayList(
        carplay.mixes(),
        mixes.map((mix) =>
          mixRow({
            id: mix.id,
            title: mix.title,
            subtitle: mix.subtitle,
            artworkUris: carPlayMixArtworkUris(mix.tracks),
          }),
        ),
      )
    } else {
      pushCarPlayList(
        carplay.downloads(),
        buildOfflineItems(offlineEntries(), melofinRootUri()),
        carplay.nothingDownloaded(),
      )
    }
    return
  }

  if (action.kind === 'playlistsMore') {
    replaceCarPlayList(
      carplay.playlists(),
      buildPlaylistItems(
        useLibraryStore.getState().playlists,
        action.offset,
        carPlayArtFor,
      ),
      carplay.noPlaylists(),
    )
    return
  }
  if (action.kind === 'albumsMore') {
    replaceCarPlayList(
      carplay.albums(),
      buildAlbumItems(
        useLibraryStore.getState().albums,
        action.offset,
        carPlayArtFor,
      ),
      carplay.noAlbums(),
    )
    return
  }
  if (action.kind === 'artistsMore') {
    replaceCarPlayList(
      carplay.artists(),
      buildArtistItems(
        useLibraryStore.getState().artists,
        action.offset,
        carPlayArtFor,
      ),
      carplay.noArtists(),
    )
    return
  }
  if (action.kind === 'songsMore') {
    replaceCarPlayList(
      carplay.songs(),
      buildSongItems(
        useLibraryStore.getState().songs,
        action.offset,
        playingId(),
        carPlayArtFor,
      ),
      carplay.noSongs(),
    )
    return
  }
  if (action.kind === 'tracksMore') {
    if (!trackListContext) return
    replaceCarPlayList(
      trackListContext.title,
      buildTrackListItems(
        trackListContext.containerType,
        trackListContext.containerId,
        trackListContext.tracks,
        action.offset,
        playingId(),
        carPlayArtFor,
      ),
      carplay.noSongs(),
    )
    return
  }
  if (action.kind === 'genresMore') {
    if (genreCache.length === 0) {
      const session = useSessionStore.getState()
      if (!session.context || !session.session) return
      const genres = await fetchMusicGenresPreview(
        session.context,
        session.session.userId,
      )
      if (!genres.ok) return
      genreCache = genres.value
    }
    replaceCarPlayList(
      carplay.genres(),
      buildGenreItems(genreCache, action.offset),
      carplay.noGenres(),
    )
    return
  }

  const session = useSessionStore.getState()
  if (!session.context || !session.session) {
    logger.warn('CarPlay action skipped', { reason: 'no_session', kind: action.kind })
    presentCarPlayNotice(carplay.unavailable())
    return
  }
  const { context } = session
  const userId = session.session.userId

  if (action.kind === 'shuffleAll') {
    const songs = await fetchRandomSongs(context, userId, 100)
    const catalog = useLibraryStore.getState().songs
    const pool =
      songs.ok && songs.value.length > 0
        ? songs.value
        : catalog.length > 0
          ? catalog
          : null
    if (!pool) {
      logger.warn('CarPlay shuffle empty', { remoteOk: songs.ok })
      noticeLoad(songs.ok)
      return
    }
    playTracks(toQueue(context, pool), 0, true)
    return
  }

  if (action.kind === 'shuffleFavorites') {
    const songs = await fetchFavoriteTracks(context, userId)
    const localFavs = useLibraryStore
      .getState()
      .songs.filter((song) => song.isFavorite)
    const pool =
      songs.ok && songs.value.length > 0
        ? songs.value
        : localFavs.length > 0
          ? localFavs
          : null
    if (!pool) {
      noticeLoad(songs.ok)
      return
    }
    playTracks(toQueue(context, pool), 0, true)
    return
  }

  if (action.kind === 'shuffleDownloads') {
    playTracks(tracksFromOffline(offlineEntries(), melofinRootUri()), 0, true)
    return
  }

  if (action.kind === 'artist') {
    await pushArtistDetail(context, userId, action.id)
    return
  }
  if (action.kind === 'song') {
    let item = useLibraryStore.getState().songs.find((song) => song.id === action.id)
    if (!item) {
      const fetched = await fetchItem(context, userId, action.id)
      if (!fetched.ok) {
        logger.warn('CarPlay song not found', { id: action.id })
        presentCarPlayNotice(carplay.unavailable())
        return
      }
      item = fetched.value
    }
    if (item.type !== 'Audio') return
    playTracks(toQueue(context, [item]), 0)
    return
  }
  if (action.kind === 'artistAlbumsMore') {
    await pushArtistDetail(context, userId, action.artistId, action.offset, true)
    return
  }

  if (action.kind === 'play' || action.kind === 'shuffle') {
    const shuffle = action.kind === 'shuffle'
    if (action.type === 'artist') {
      const songs = await fetchSongsForArtist(context, userId, action.id)
      if (!songs.ok || songs.value.length === 0) {
        logger.warn('CarPlay catalog empty', { id: action.id, kind: action.kind })
        noticeLoad(songs.ok)
        return
      }
      playTracks(toQueue(context, songs.value), 0, shuffle)
      return
    }
    if (action.type === 'playlist') {
      const result = await fetchPlaylistTracks(context, userId, action.id)
      if (!result.ok || result.value.length === 0) {
        logger.warn('CarPlay catalog empty', { id: action.id, kind: action.kind })
        noticeLoad(result.ok)
        return
      }
      playTracks(toQueue(context, result.value), 0, shuffle)
      return
    }
    const result = await fetchChildren(context, userId, action.id)
    if (!result.ok || result.value.length === 0) {
      logger.warn('CarPlay catalog empty', { id: action.id, kind: action.kind })
      noticeLoad(result.ok)
      return
    }
    playTracks(toQueue(context, result.value), 0, shuffle)
    return
  }

  if (action.kind === 'playlist') {
    const result = await fetchPlaylistTracks(context, userId, action.id)
    if (!result.ok || result.value.length === 0) {
      logger.warn('CarPlay catalog empty', { id: action.id, kind: action.kind })
      noticeLoad(result.ok)
      return
    }
    const playlist = useLibraryStore
      .getState()
      .playlists.find((item) => item.id === action.id)
    openTrackList(
      playlist?.name ?? carplay.playlist(),
      'playlist',
      action.id,
      result.value,
      context,
    )
    return
  }

  if (action.kind === 'album') {
    const result = await fetchChildren(context, userId, action.id)
    if (!result.ok || result.value.length === 0) {
      logger.warn('CarPlay catalog empty', { id: action.id, kind: action.kind })
      noticeLoad(result.ok)
      return
    }
    const album = useLibraryStore
      .getState()
      .albums.find((item) => item.id === action.id)
    openTrackList(
      album?.name ?? carplay.album(),
      'album',
      action.id,
      result.value,
      context,
    )
    return
  }

  if (action.kind === 'genre' || action.kind === 'genreName') {
    const result =
      action.kind === 'genre'
        ? await fetchInstantMixFromGenre(context, userId, action.id)
        : await fetchInstantMixFromGenreName(context, userId, action.name)
    if (!result.ok || result.value.length === 0) {
      logger.warn('CarPlay genre mix empty', { kind: action.kind })
      noticeLoad(result.ok)
      return
    }
    playTracks(toQueue(context, result.value), 0, true)
    return
  }

  if (action.kind === 'mix') {
    const mix = useHomeMixesStore.getState().byId[action.id]
    if (!mix || mix.tracks.length === 0) {
      presentCarPlayNotice(carplay.nothingToPlay())
      return
    }
    playTracks(toQueue(context, mix.tracks), 0, true)
  }
}

export const wireCarPlayHandlers = (): void => {
  setCarPlayPressHandler(handleCarPlayItemPress)
  setCarPlaySearchOpener(openCarPlaySearch)
  setCarPlayNowPlayingHandler(handleNowPlaying)
}
