import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api'
import { getInstantMixApi } from '@jellyfin/sdk/lib/utils/api/instant-mix-api'
import { getLyricsApi } from '@jellyfin/sdk/lib/utils/api/lyrics-api'
import { getMusicGenresApi } from '@jellyfin/sdk/lib/utils/api/music-genres-api'
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api'
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api'
import { mapLyricDto, type LyricsPayload } from '@/src/domain/lyrics'
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind'
import type { ItemFilter } from '@jellyfin/sdk/lib/generated-client/models/item-filter'
import type { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields'
import type { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by'
import type { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order'
import { mergeAlbumLists, shouldQueryGenreTracksById, uniqueAlbumsFromTracks } from '@/src/domain/genreAlbums'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  dedupeLibraryItems,
  dedupePlaylistTracks,
  GENRE_TRACK_PAGE_SIZE,
  LIBRARY_PAGE_SIZE,
  shouldFetchNextPage,
} from '@/src/services/jellyfin/libraryPaging'
import { mapBaseItem, type LibraryItem } from '@/src/services/jellyfin/mappers'

export type { LibraryItem } from '@/src/services/jellyfin/mappers'
export {
  artworkUrl,
  audioAuthHeaders,
  buildAudioStreamUrl,
  buildDirectPlayStreamUrls,
  buildPlaybackStreamCandidates,
  buildUniversalStreamUrl,
  resizeArtworkUrl,
  toQueueTrack,
  userImageUrl,
} from '@/src/services/jellyfin/mappers'

const mapItems = (items: unknown[] | undefined): readonly LibraryItem[] =>
  (items ?? []).map((item) => mapBaseItem(item as Record<string, unknown>))

const fail = (message: string, cause: unknown) =>
  err(appError('network', message, cause))

const isCancelledCause = (cause: unknown): boolean => {
  const name = (cause as { name?: string } | undefined)?.name
  const code = (cause as { code?: string } | undefined)?.code
  return (
    name === 'CanceledError' ||
    name === 'AbortError' ||
    code === 'ERR_CANCELED'
  )
}

type ItemQuery = {
  readonly userId: string
  readonly includeItemTypes: readonly BaseItemKind[]
  readonly recursive?: boolean
  readonly sortBy?: readonly ItemSortBy[]
  readonly sortOrder?: readonly SortOrder[]
  readonly filters?: readonly ItemFilter[]
  readonly parentId?: string
  readonly searchTerm?: string
  readonly minDateLastSaved?: string
  readonly genreIds?: readonly string[]
  readonly genres?: readonly string[]
  readonly isPlayed?: boolean
  readonly artistIds?: readonly string[]
  readonly albumArtistIds?: readonly string[]
  readonly contributingArtistIds?: readonly string[]
  readonly enableImages?: boolean
  readonly enableUserData?: boolean
  readonly imageTypeLimit?: number
  readonly fields?: readonly ItemFields[]
}

export const artistAlbumsQuery = (userId: string, artistId: string) => ({
  userId,
  includeItemTypes: ['MusicAlbum'] as const,
  albumArtistIds: [artistId] as const,
  sortBy: ['ProductionYear', 'SortName'] as const,
  sortOrder: ['Ascending'] as const,
})

/** Albums where the artist appears (not only as AlbumArtist). */
export const artistAppearsOnAlbumsQuery = (userId: string, artistId: string) => ({
  userId,
  includeItemTypes: ['MusicAlbum'] as const,
  artistIds: [artistId] as const,
  sortBy: ['ProductionYear', 'SortName'] as const,
  sortOrder: ['Ascending'] as const,
})

export const artistContributingAlbumsQuery = (
  userId: string,
  artistId: string,
) => ({
  userId,
  includeItemTypes: ['MusicAlbum'] as const,
  contributingArtistIds: [artistId] as const,
  sortBy: ['ProductionYear', 'SortName'] as const,
  sortOrder: ['Ascending'] as const,
})

export const genreAlbumsByIdQuery = (userId: string, genreId: string) => ({
  userId,
  includeItemTypes: ['MusicAlbum'] as const,
  genreIds: [genreId] as const,
  sortBy: ['SortName'] as const,
  sortOrder: ['Ascending'] as const,
})

export const genreAlbumsByNameQuery = (userId: string, genreName: string) => ({
  userId,
  includeItemTypes: ['MusicAlbum'] as const,
  genres: [genreName] as const,
  sortBy: ['SortName'] as const,
  sortOrder: ['Ascending'] as const,
})

export const genreTracksQuery = (
  userId: string,
  genreId: string,
  genreName?: string,
) => {
  const name = genreName?.trim()
  return {
    userId,
    includeItemTypes: ['Audio'] as const,
    sortBy: ['DateCreated'] as const,
    sortOrder: ['Descending'] as const,
    enableUserData: false as const,
    imageTypeLimit: 1,
    fields: ['ParentId'] as const,
    ...(name ? { genres: [name] as const } : { genreIds: [genreId] as const }),
  }
}

type Page = {
  readonly items: readonly LibraryItem[]
  readonly total: number
}

export const fetchItemsPage = async (
  context: JellyfinContext,
  query: ItemQuery,
  startIndex: number,
  limit: number,
  signal?: AbortSignal,
): Promise<Result<Page>> => {
  try {
    const response = await getItemsApi(context.api).getItems(
      {
        userId: query.userId,
        includeItemTypes: [...query.includeItemTypes],
        recursive: query.recursive ?? true,
        sortBy: query.sortBy ? [...query.sortBy] : undefined,
        sortOrder: query.sortOrder ? [...query.sortOrder] : undefined,
        filters: query.filters ? [...query.filters] : undefined,
        parentId: query.parentId,
        searchTerm: query.searchTerm,
        minDateLastSaved: query.minDateLastSaved,
        genreIds: query.genreIds ? [...query.genreIds] : undefined,
        genres: query.genres ? [...query.genres] : undefined,
        isPlayed: query.isPlayed,
        artistIds: query.artistIds ? [...query.artistIds] : undefined,
        albumArtistIds: query.albumArtistIds ? [...query.albumArtistIds] : undefined,
        contributingArtistIds: query.contributingArtistIds
          ? [...query.contributingArtistIds]
          : undefined,
        enableImages: query.enableImages ?? true,
        enableUserData: query.enableUserData ?? true,
        ...(query.imageTypeLimit !== undefined
          ? { imageTypeLimit: query.imageTypeLimit }
          : {}),
        enableTotalRecordCount: true,
        fields: query.fields
          ? [...query.fields]
          : ['PrimaryImageAspectRatio', 'Genres', 'ChildCount', 'ParentId'],
        startIndex,
        limit,
      },
      signal ? { signal } : undefined,
    )
    const items = mapItems(response.data.Items)
    return ok({
      items,
      total: Number(response.data.TotalRecordCount ?? 0),
    })
  } catch (cause) {
    if (isCancelledCause(cause)) {
      return err(appError('cancelled', 'Request cancelled', cause))
    }
    return fail('Failed to load library', cause)
  }
}

const fetchAllItemPages = async (
  context: JellyfinContext,
  query: ItemQuery,
  opts?: { readonly pageSize?: number; readonly signal?: AbortSignal },
): Promise<Result<readonly LibraryItem[]>> => {
  const items: LibraryItem[] = []
  let startIndex = 0
  const pageSize = opts?.pageSize ?? LIBRARY_PAGE_SIZE
  for (;;) {
    if (opts?.signal?.aborted) {
      return items.length > 0
        ? ok(dedupeLibraryItems(items))
        : err(appError('cancelled', 'Request cancelled'))
    }
    const page = await fetchItemsPage(
      context,
      query,
      startIndex,
      pageSize,
      opts?.signal,
    )
    if (!page.ok) {
      if (page.error.code === 'cancelled' && items.length > 0) {
        return ok(dedupeLibraryItems(items))
      }
      return page
    }
    for (const item of page.value.items) {
      items.push(item)
    }
    if (
      !shouldFetchNextPage(
        startIndex,
        page.value.items.length,
        page.value.total,
        pageSize,
      )
    ) {
      return ok(dedupeLibraryItems(items))
    }
    startIndex += page.value.items.length
  }
}

export const fetchLatestAlbums = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> => {
  const page = await fetchItemsPage(
    context,
    {
      userId,
      includeItemTypes: ['MusicAlbum'],
      sortBy: ['DateCreated'],
      sortOrder: ['Descending'],
    },
    0,
    24,
  )
  if (!page.ok) return page
  return ok(dedupeLibraryItems(page.value.items))
}

export const fetchAlbums = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> =>
  fetchAllItemPages(context, {
    userId,
    includeItemTypes: ['MusicAlbum'],
    sortBy: ['SortName'],
    sortOrder: ['Ascending'],
  })

/** Albums where the given artist is an album artist, appears, or contributes. */
export const fetchAlbumsByArtist = async (
  context: JellyfinContext,
  userId: string,
  artistId: string,
): Promise<Result<readonly LibraryItem[]>> => {
  const [albumArtist, appears, contributing] = await Promise.all([
    fetchAllItemPages(context, artistAlbumsQuery(userId, artistId)),
    fetchAllItemPages(context, artistAppearsOnAlbumsQuery(userId, artistId)),
    fetchAllItemPages(context, artistContributingAlbumsQuery(userId, artistId)),
  ])
  const catalog = mergeAlbumLists(
    mergeAlbumLists(
      albumArtist.ok ? albumArtist.value : [],
      appears.ok ? appears.value : [],
    ),
    contributing.ok ? contributing.value : [],
  )
  if (catalog.length > 0) return ok(catalog)
  if (!albumArtist.ok) return albumArtist
  if (!appears.ok) return appears
  if (!contributing.ok) return contributing
  return ok(catalog)
}

export const fetchMusicGenres = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const items: LibraryItem[] = []
    let startIndex = 0
    for (;;) {
      const response = await getMusicGenresApi(context.api).getMusicGenres({
        userId,
        startIndex,
        limit: LIBRARY_PAGE_SIZE,
        sortBy: ['SortName'],
        sortOrder: ['Ascending'],
        enableImages: true,
        enableTotalRecordCount: true,
      })
      const page = mapItems(response.data.Items)
      for (const item of page) items.push(item)
      const total = Number(response.data.TotalRecordCount ?? items.length)
      if (
        !shouldFetchNextPage(startIndex, page.length, total)
      ) {
        return ok(dedupeLibraryItems(items))
      }
      startIndex += page.length
    }
  } catch (cause) {
    return fail('Failed to load genres', cause)
  }
}

const publishGenreAlbums = (
  catalog: readonly LibraryItem[],
  derived: readonly LibraryItem[],
  onPartial?: (albums: readonly LibraryItem[]) => void,
): readonly LibraryItem[] => {
  const albums = mergeAlbumLists(catalog, derived)
  onPartial?.(albums)
  return albums
}

const deriveAlbumsFromGenreTrackPages = async (
  context: JellyfinContext,
  query: ItemQuery,
  catalog: readonly LibraryItem[],
  onPartial: ((albums: readonly LibraryItem[]) => void) | undefined,
  signal: AbortSignal | undefined,
  resume?: {
    readonly startIndex: number
    readonly derived: LibraryItem[]
    readonly seen: Set<string>
  },
): Promise<Result<readonly LibraryItem[]>> => {
  const seen = resume?.seen ?? new Set(catalog.map((album) => album.id))
  const derived = resume?.derived ?? []
  let startIndex = resume?.startIndex ?? 0
  for (;;) {
    if (signal?.aborted) return ok(publishGenreAlbums(catalog, derived))
    const page = await fetchItemsPage(
      context,
      query,
      startIndex,
      GENRE_TRACK_PAGE_SIZE,
      signal,
    )
    if (!page.ok) {
      if (
        page.error.code === 'cancelled' ||
        derived.length > 0 ||
        catalog.length > 0
      ) {
        return ok(publishGenreAlbums(catalog, derived, onPartial))
      }
      return page
    }
    let added = false
    for (const album of uniqueAlbumsFromTracks(page.value.items)) {
      if (seen.has(album.id)) continue
      seen.add(album.id)
      derived.push(album)
      added = true
    }
    if (added || startIndex === 0) {
      publishGenreAlbums(catalog, derived, onPartial)
    }
    if (
      !shouldFetchNextPage(
        startIndex,
        page.value.items.length,
        page.value.total,
        GENRE_TRACK_PAGE_SIZE,
      )
    ) {
      return ok(publishGenreAlbums(catalog, derived, onPartial))
    }
    startIndex += page.value.items.length
  }
}

export const fetchAlbumsByGenre = async (
  context: JellyfinContext,
  userId: string,
  genreId: string,
  genreName?: string,
  opts?: {
    readonly onPartial?: (albums: readonly LibraryItem[]) => void
    readonly signal?: AbortSignal
  },
): Promise<Result<readonly LibraryItem[]>> => {
  const name = genreName?.trim()
  const signal = opts?.signal
  const onPartial = opts?.onPartial
  const trackQuery = genreTracksQuery(userId, genreId, name)
  const byIdP = fetchAllItemPages(context, genreAlbumsByIdQuery(userId, genreId), {
    signal,
  })
  const byNameP = name
    ? fetchAllItemPages(context, genreAlbumsByNameQuery(userId, name), { signal })
    : Promise.resolve(ok([]))
  const firstTracksP = fetchItemsPage(
    context,
    trackQuery,
    0,
    GENRE_TRACK_PAGE_SIZE,
    signal,
  )
  void Promise.all([byIdP, byNameP]).then(([byId, byName]) => {
    if (signal?.aborted) return
    const early = mergeAlbumLists(
      byId.ok ? byId.value : [],
      byName.ok ? byName.value : [],
    )
    if (early.length > 0) onPartial?.(early)
  })
  const [byId, byName, firstTracks] = await Promise.all([
    byIdP,
    byNameP,
    firstTracksP,
  ])
  if (signal?.aborted) {
    return ok(
      mergeAlbumLists(byId.ok ? byId.value : [], byName.ok ? byName.value : []),
    )
  }
  const catalog = mergeAlbumLists(
    byId.ok ? byId.value : [],
    byName.ok ? byName.value : [],
  )
  const seen = new Set(catalog.map((album) => album.id))
  const derived: LibraryItem[] = []
  if (firstTracks.ok) {
    for (const album of uniqueAlbumsFromTracks(firstTracks.value.items)) {
      if (seen.has(album.id)) continue
      seen.add(album.id)
      derived.push(album)
    }
  }
  const initial = publishGenreAlbums(catalog, derived, onPartial)
  const nameTrackCount = firstTracks.ok
    ? Math.max(firstTracks.value.total, firstTracks.value.items.length)
    : undefined
  if (!firstTracks.ok && !name) {
    return initial.length > 0 ? ok(initial) : firstTracks
  }
  const moreTracks =
    firstTracks.ok &&
    shouldFetchNextPage(
      0,
      firstTracks.value.items.length,
      firstTracks.value.total,
      GENRE_TRACK_PAGE_SIZE,
    )
  const continued = moreTracks
    ? await deriveAlbumsFromGenreTrackPages(
        context,
        trackQuery,
        catalog,
        onPartial,
        signal,
        {
          startIndex: firstTracks.value.items.length,
          derived,
          seen,
        },
      )
    : ok(initial)

  if (!continued.ok) return continued
  if (signal?.aborted) return continued
  if (!firstTracks.ok && firstTracks.error.code === 'cancelled') {
    return continued
  }
  if (!shouldQueryGenreTracksById(name, nameTrackCount)) return continued

  return deriveAlbumsFromGenreTrackPages(
    context,
    genreTracksQuery(userId, genreId),
    continued.value,
    onPartial,
    signal,
  )
}

export const fetchPlaylists = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> =>
  fetchAllItemPages(context, {
    userId,
    includeItemTypes: ['Playlist'],
    sortBy: ['SortName'],
    sortOrder: ['Ascending'],
  })

export const fetchRecentPlaylists = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> => {
  const page = await fetchItemsPage(
    context,
    {
      userId,
      includeItemTypes: ['Playlist'],
      sortBy: ['DatePlayed', 'DateLastContentAdded', 'SortName'],
      sortOrder: ['Descending'],
    },
    0,
    24,
  )
  if (!page.ok) return page
  return ok(dedupeLibraryItems(page.value.items))
}

export const fetchFavoriteTracks = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> => {
  const page = await fetchItemsPage(
    context,
    {
      userId,
      includeItemTypes: ['Audio'],
      filters: ['IsFavorite'],
      sortBy: ['Random'],
    },
    0,
    100,
  )
  if (!page.ok) return page
  return ok(dedupeLibraryItems(page.value.items))
}

/** Artists marked favorite in Jellyfin (when the server tracks that). */
export const fetchFavoriteArtists = async (
  context: JellyfinContext,
  userId: string,
  limit = 24,
): Promise<Result<readonly LibraryItem[]>> => {
  const page = await fetchItemsPage(
    context,
    {
      userId,
      includeItemTypes: ['MusicArtist'],
      filters: ['IsFavorite'],
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
    },
    0,
    limit,
  )
  if (!page.ok) return page
  return ok(dedupeLibraryItems(page.value.items))
}

export const fetchMusicGenresPreview = async (
  context: JellyfinContext,
  userId: string,
  limit = 16,
  opts?: { readonly enableImages?: boolean },
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const response = await getMusicGenresApi(context.api).getMusicGenres({
      userId,
      startIndex: 0,
      limit,
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
      enableImages: opts?.enableImages ?? true,
      enableTotalRecordCount: false,
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load genres', cause)
  }
}

export const markFavorite = async (
  context: JellyfinContext,
  userId: string,
  itemId: string,
): Promise<Result<void>> => {
  try {
    await getUserLibraryApi(context.api).markFavoriteItem({ userId, itemId })
    return ok(undefined)
  } catch (cause) {
    return fail('Failed to favorite item', cause)
  }
}

export const unmarkFavorite = async (
  context: JellyfinContext,
  userId: string,
  itemId: string,
): Promise<Result<void>> => {
  try {
    await getUserLibraryApi(context.api).unmarkFavoriteItem({ userId, itemId })
    return ok(undefined)
  } catch (cause) {
    return fail('Failed to unfavorite item', cause)
  }
}

export const fetchLyrics = async (
  context: JellyfinContext,
  itemId: string,
): Promise<Result<LyricsPayload>> => {
  try {
    const response = await getLyricsApi(context.api).getLyrics({ itemId })
    return ok(mapLyricDto(response.data ?? {}))
  } catch (cause) {
    return fail('Failed to load lyrics', cause)
  }
}

export const fetchRandomSongs = async (
  context: JellyfinContext,
  userId: string,
  limit = 100,
): Promise<Result<readonly LibraryItem[]>> => {
  const page = await fetchItemsPage(
    context,
    {
      userId,
      includeItemTypes: ['Audio'],
      sortBy: ['Random'],
    },
    0,
    limit,
  )
  if (!page.ok) return page
  return ok(dedupeLibraryItems(page.value.items))
}

const INSTANT_MIX_LIMIT = 100
/** Cap Instant Mix size for Home cards. */
export const INSTANT_MIX_HOME_LIMIT = 48

export const fetchInstantMix = async (
  context: JellyfinContext,
  userId: string,
  itemId: string,
  limit = INSTANT_MIX_LIMIT,
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const response = await getInstantMixApi(context.api).getInstantMixFromItem({
      itemId,
      userId,
      limit,
      enableImages: true,
      enableUserData: true,
      fields: ['PrimaryImageAspectRatio', 'Genres'],
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load Instant Mix', cause)
  }
}

/** Instant Mix seeded from a MusicArtist — usually tighter than a single song. */
export const fetchInstantMixFromArtist = async (
  context: JellyfinContext,
  userId: string,
  artistId: string,
  limit = INSTANT_MIX_LIMIT,
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const response = await getInstantMixApi(context.api).getInstantMixFromArtists({
      itemId: artistId,
      userId,
      limit,
      enableImages: true,
      enableUserData: true,
      fields: ['PrimaryImageAspectRatio', 'Genres'],
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load artist Instant Mix', cause)
  }
}

/** Instant Mix seeded from a music genre id. */
export const fetchInstantMixFromGenre = async (
  context: JellyfinContext,
  userId: string,
  genreId: string,
  limit = INSTANT_MIX_LIMIT,
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const response = await getInstantMixApi(context.api).getInstantMixFromMusicGenreById({
      id: genreId,
      userId,
      limit,
      enableImages: true,
      enableUserData: true,
      fields: ['PrimaryImageAspectRatio', 'Genres'],
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load genre Instant Mix', cause)
  }
}

/** Instant Mix seeded from a genre name (when the id isn’t in the catalog page). */
export const fetchInstantMixFromGenreName = async (
  context: JellyfinContext,
  userId: string,
  genreName: string,
  limit = INSTANT_MIX_LIMIT,
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const response = await getInstantMixApi(context.api).getInstantMixFromMusicGenreByName({
      name: genreName,
      userId,
      limit,
      enableImages: true,
      enableUserData: true,
      fields: ['PrimaryImageAspectRatio', 'Genres'],
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load genre Instant Mix', cause)
  }
}

export const fetchRecentSongs = async (
  context: JellyfinContext,
  userId: string,
  limit = 24,
): Promise<Result<readonly LibraryItem[]>> => {
  const page = await fetchItemsPage(
    context,
    {
      userId,
      includeItemTypes: ['Audio'],
      sortBy: ['DatePlayed'],
      sortOrder: ['Descending'],
    },
    0,
    limit,
  )
  if (!page.ok) return page
  return ok(dedupeLibraryItems(page.value.items))
}

export const fetchSongsByArtist = async (
  context: JellyfinContext,
  userId: string,
  artistId: string,
  limit = 24,
): Promise<Result<readonly LibraryItem[]>> => {
  const page = await fetchItemsPage(
    context,
    {
      userId,
      includeItemTypes: ['Audio'],
      artistIds: [artistId],
      sortBy: ['Random'],
    },
    0,
    limit,
  )
  if (!page.ok) return page
  return ok(dedupeLibraryItems(page.value.items))
}

/** Full artist discography (ArtistIds filter — ParentId only returns children of the artist folder). */
export const fetchSongsForArtist = async (
  context: JellyfinContext,
  userId: string,
  artistId: string,
): Promise<Result<readonly LibraryItem[]>> =>
  fetchAllItemPages(context, {
    userId,
    includeItemTypes: ['Audio'],
    artistIds: [artistId],
    sortBy: ['Album', 'ParentIndexNumber', 'IndexNumber', 'SortName'],
    sortOrder: ['Ascending'],
  })

export const fetchArtists = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> =>
  fetchAllItemPages(context, {
    userId,
    includeItemTypes: ['MusicArtist'],
    sortBy: ['SortName'],
    sortOrder: ['Ascending'],
  })

export const fetchSongs = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> =>
  fetchAllItemPages(context, {
    userId,
    includeItemTypes: ['Audio'],
    sortBy: ['SortName'],
    sortOrder: ['Ascending'],
  })

/** Cheap total probe for skip-unchanged song sync. */
export const fetchSongsCount = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<number>> => {
  try {
    const response = await getItemsApi(context.api).getItems({
      userId,
      includeItemTypes: ['Audio'],
      recursive: true,
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
      enableImages: false,
      enableUserData: false,
      enableTotalRecordCount: true,
      startIndex: 0,
      limit: 1,
    })
    const total = Number(response.data.TotalRecordCount)
    if (!Number.isFinite(total) || total < 0) {
      return err(appError('network', 'Song count unavailable'))
    }
    return ok(total)
  } catch (cause) {
    return fail('Failed to count songs', cause)
  }
}

/** Incremental song pull since last sync (ISO date). */
export const fetchSongsSince = async (
  context: JellyfinContext,
  userId: string,
  minDateLastSaved: string,
): Promise<Result<readonly LibraryItem[]>> =>
  fetchAllItemPages(context, {
    userId,
    includeItemTypes: ['Audio'],
    sortBy: ['SortName'],
    sortOrder: ['Ascending'],
    minDateLastSaved,
  })

export const searchLibrary = async (
  context: JellyfinContext,
  userId: string,
  term: string,
  signal?: AbortSignal,
): Promise<Result<readonly LibraryItem[]>> => {
  if (!term.trim()) return ok([])
  const page = await fetchItemsPage(
    context,
    {
      userId,
      searchTerm: term.trim(),
      includeItemTypes: ['Audio', 'MusicAlbum', 'MusicArtist', 'Playlist'],
    },
    0,
    40,
    signal,
  )
  if (!page.ok) {
    if (page.error.code === 'cancelled') {
      return err(appError('cancelled', 'Search cancelled', page.error.cause))
    }
    return fail('Search failed', page.error.cause)
  }
  return ok(dedupeLibraryItems(page.value.items))
}

export const fetchChildren = async (
  context: JellyfinContext,
  userId: string,
  parentId: string,
): Promise<Result<readonly LibraryItem[]>> =>
  fetchAllItemPages(context, {
    userId,
    parentId,
    includeItemTypes: ['Audio'],
    sortBy: ['ParentIndexNumber', 'IndexNumber', 'SortName'],
    sortOrder: ['Ascending'],
  })

export const fetchPlaylistTracks = async (
  context: JellyfinContext,
  userId: string,
  playlistId: string,
): Promise<Result<readonly LibraryItem[]>> => {
  const pageSize = LIBRARY_PAGE_SIZE
  const collect = async (
    startIndex: number,
    acc: readonly LibraryItem[],
  ): Promise<Result<readonly LibraryItem[]>> => {
    try {
      const response = await getPlaylistsApi(context.api).getPlaylistItems({
        playlistId,
        userId,
        startIndex,
        limit: pageSize,
        enableImages: true,
        enableUserData: true,
        fields: ['PrimaryImageAspectRatio'],
      })
      const page = mapItems(response.data.Items)
      const merged = [...acc, ...page]
      const total = Number(response.data.TotalRecordCount ?? merged.length)
      if (!shouldFetchNextPage(startIndex, page.length, total)) {
        return ok(dedupePlaylistTracks(merged))
      }
      return collect(startIndex + page.length, merged)
    } catch (cause) {
      if (acc.length > 0) return ok(dedupePlaylistTracks(acc))
      // Some servers reject /Playlists/{id}/Items — fall back to parent Items query.
      const fallback = await fetchChildren(context, userId, playlistId)
      if (fallback.ok) return fallback
      return fail('Failed to load playlist tracks', cause)
    }
  }
  return collect(0, [])
}

export const fetchItem = async (
  context: JellyfinContext,
  userId: string,
  itemId: string,
): Promise<Result<LibraryItem>> => {
  try {
    const response = await getUserLibraryApi(context.api).getItem({
      userId,
      itemId,
    })
    return ok(mapBaseItem(response.data as unknown as Record<string, unknown>))
  } catch (cause) {
    return fail('Failed to load details', cause)
  }
}

export const fetchResume = async (
  context: JellyfinContext,
  userId: string,
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const response = await getItemsApi(context.api).getResumeItems({
      userId,
      mediaTypes: ['Audio'],
      limit: 12,
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load resume', cause)
  }
}
