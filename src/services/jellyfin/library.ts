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
import {
  BROWSE_GENRE_ART_SAMPLES,
  BROWSE_GENRE_MIN_ALBUMS,
  BROWSE_GENRE_PROBE_ALBUMS,
  BROWSE_GENRES_CACHE_POOL_SIZE,
  BROWSE_GENRES_PROBE_LIMIT,
  browseGenreAlbumCount,
  collectBrowseGenres,
  shouldPublishBrowseProgress,
  type BrowseGenre,
} from '@/src/domain/browseGenres'
import { uniqueCollageItems } from '@/src/domain/collageArt'
import { genreTrackQueryModes, mergeAlbumLists, uniqueAlbumsFromTracks } from '@/src/domain/genreAlbums'
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
  readonly enableTotalRecordCount?: boolean
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

const genreTrackQueries = (
  userId: string,
  genreId: string,
  genreName?: string,
) =>
  genreTrackQueryModes(genreName).map((mode) =>
    mode === 'name'
      ? genreTracksQuery(userId, genreId, genreName)
      : genreTracksQuery(userId, genreId),
  )

/** Cheap existence check: any album or song tagged with this genre id. */
export const genreContentByIdQuery = (userId: string, genreId: string) => ({
  userId,
  includeItemTypes: ['MusicAlbum', 'Audio'] as const,
  genreIds: [genreId] as const,
  enableImages: false as const,
  enableUserData: false as const,
  fields: ['ParentId'] as const,
})

/** Same probe by genre name — Jellyfin often tags Audio by name only. */
export const genreContentByNameQuery = (userId: string, genreName: string) => ({
  userId,
  includeItemTypes: ['MusicAlbum', 'Audio'] as const,
  genres: [genreName] as const,
  enableImages: false as const,
  enableUserData: false as const,
  fields: ['ParentId'] as const,
})

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
        enableTotalRecordCount: query.enableTotalRecordCount ?? true,
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
  const pageSize = opts?.pageSize ?? LIBRARY_PAGE_SIZE

  const loop = async (
    startIndex: number,
  ): Promise<Result<readonly LibraryItem[]>> => {
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
    return loop(startIndex + page.value.items.length)
  }

  return loop(0)
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
    const loop = async (
      startIndex: number,
    ): Promise<Result<readonly LibraryItem[]>> => {
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
      if (!shouldFetchNextPage(startIndex, page.length, total)) {
        return ok(dedupeLibraryItems(items))
      }
      return loop(startIndex + page.length)
    }
    return await loop(0)
  } catch (cause) {
    return fail('Failed to load genres', cause)
  }
}

const deriveAlbumsFromGenreTrackPages = async (
  context: JellyfinContext,
  query: ItemQuery,
  catalog: readonly LibraryItem[],
  signal: AbortSignal | undefined,
  resume?: {
    readonly startIndex: number
    readonly derived: LibraryItem[]
    readonly seen: Set<string>
  },
): Promise<Result<readonly LibraryItem[]>> => {
  const seen = resume?.seen ?? new Set(catalog.map((album) => album.id))
  const derived = resume?.derived ?? []

  const loop = async (
    startIndex: number,
  ): Promise<Result<readonly LibraryItem[]>> => {
    if (signal?.aborted) return ok(mergeAlbumLists(catalog, derived))
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
        return ok(mergeAlbumLists(catalog, derived))
      }
      return page
    }
    for (const album of uniqueAlbumsFromTracks(page.value.items)) {
      if (seen.has(album.id)) continue
      seen.add(album.id)
      derived.push(album)
    }
    if (
      !shouldFetchNextPage(
        startIndex,
        page.value.items.length,
        page.value.total,
        GENRE_TRACK_PAGE_SIZE,
      )
    ) {
      return ok(mergeAlbumLists(catalog, derived))
    }
    return loop(startIndex + page.value.items.length)
  }

  return loop(resume?.startIndex ?? 0)
}

export const fetchAlbumsByGenre = async (
  context: JellyfinContext,
  userId: string,
  genreId: string,
  genreName?: string,
  opts?: {
    readonly signal?: AbortSignal
  },
): Promise<Result<readonly LibraryItem[]>> => {
  const name = genreName?.trim()
  const signal = opts?.signal
  const byIdP = fetchAllItemPages(context, genreAlbumsByIdQuery(userId, genreId), {
    signal,
  })
  const byNameP = name
    ? fetchAllItemPages(context, genreAlbumsByNameQuery(userId, name), { signal })
    : Promise.resolve(ok([]))
  const [byId, byName] = await Promise.all([byIdP, byNameP])
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
  let latest = catalog
  let lastError: Result<readonly LibraryItem[]> | undefined
  for (const query of genreTrackQueries(userId, genreId, name)) {
    const result = await deriveAlbumsFromGenreTrackPages(
      context,
      query,
      catalog,
      signal,
      { startIndex: 0, derived, seen },
    )
    if (result.ok) latest = result.value
    else lastError = result
    if (signal?.aborted) break
  }
  if (latest.length > 0 || !lastError) return ok(latest)
  return lastError
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
  opts?: {
    readonly enableImages?: boolean
    readonly sortBy?: readonly ItemSortBy[]
    readonly sortOrder?: readonly SortOrder[]
  },
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const response = await getMusicGenresApi(context.api).getMusicGenres({
      userId,
      startIndex: 0,
      limit,
      sortBy: [...(opts?.sortBy ?? ['SortName'])],
      sortOrder: [...(opts?.sortOrder ?? ['Ascending'])],
      enableImages: opts?.enableImages ?? true,
      enableTotalRecordCount: false,
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load genres', cause)
  }
}

const BROWSE_GENRE_TRACK_PROBE = 24

const albumCountFromPage = (
  page: Result<{ readonly items: readonly LibraryItem[]; readonly total: number }>,
): number =>
  page.ok ? browseGenreAlbumCount(page.value.total, page.value.items.length) : 0

const pickBrowseGenreAlbums = (
  ...sources: readonly (readonly LibraryItem[])[]
): readonly LibraryItem[] => {
  const merged: LibraryItem[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    for (const album of source) {
      if (!album.id || seen.has(album.id)) continue
      seen.add(album.id)
      merged.push(album)
    }
  }
  return uniqueCollageItems(merged, BROWSE_GENRE_ART_SAMPLES)
}

const browseGenreAlbumsProbeQuery = (
  userId: string,
  genreId: string,
  genreName?: string,
) => ({
  ...(genreName
    ? genreAlbumsByNameQuery(userId, genreName)
    : genreAlbumsByIdQuery(userId, genreId)),
  enableUserData: false as const,
  enableTotalRecordCount: false as const,
  imageTypeLimit: 1,
  fields: ['PrimaryImageAspectRatio'] as const,
})

const loadGenreAlbumProbe = async (
  context: JellyfinContext,
  userId: string,
  genre: Pick<LibraryItem, 'id' | 'name'>,
  signal?: AbortSignal,
  minAlbums?: number,
): Promise<{
  readonly sampleAlbums: readonly LibraryItem[]
  readonly albumCount: number
}> => {
  const name = genre.name.trim()
  const uniqueIds = new Set<string>()
  let albumCount = 0
  let sampleAlbums: readonly LibraryItem[] = []
  const artTarget = minAlbums !== undefined ? 1 : BROWSE_GENRE_ART_SAMPLES
  const needMore = () =>
    sampleAlbums.length < artTarget ||
    (minAlbums !== undefined && albumCount < minAlbums)

  const ingestAlbums = (page: Result<Page>) => {
    const items = page.ok ? page.value.items : []
    for (const album of items) {
      if (album.id) uniqueIds.add(album.id)
    }
    albumCount = Math.max(albumCount, albumCountFromPage(page), uniqueIds.size)
    sampleAlbums = pickBrowseGenreAlbums(sampleAlbums, items)
  }

  ingestAlbums(
    await fetchItemsPage(
      context,
      browseGenreAlbumsProbeQuery(userId, genre.id),
      0,
      BROWSE_GENRE_PROBE_ALBUMS,
      signal,
    ),
  )
  if (!needMore() || signal?.aborted) return { sampleAlbums, albumCount }
  if (name) {
    ingestAlbums(
      await fetchItemsPage(
        context,
        browseGenreAlbumsProbeQuery(userId, genre.id, name),
        0,
        BROWSE_GENRE_PROBE_ALBUMS,
        signal,
      ),
    )
  }
  if (!needMore() || signal?.aborted) return { sampleAlbums, albumCount }
  for (const query of genreTrackQueries(userId, genre.id, name || undefined)) {
    if (signal?.aborted) break
    const tracks = await fetchItemsPage(context, query, 0, BROWSE_GENRE_TRACK_PROBE, signal)
    if (!tracks.ok) continue
    const derived = uniqueAlbumsFromTracks(tracks.value.items)
    for (const album of derived) {
      if (album.id) uniqueIds.add(album.id)
    }
    albumCount = Math.max(albumCount, uniqueIds.size)
    sampleAlbums = pickBrowseGenreAlbums(sampleAlbums, derived)
    if (!needMore()) break
  }
  return { sampleAlbums, albumCount }
}

/** Random album covers for a genre tile. Fills from tracks when albums repeat art. */
export const fetchGenreArtSamples = async (
  context: JellyfinContext,
  userId: string,
  genre: Pick<LibraryItem, 'id' | 'name'>,
  signal?: AbortSignal,
): Promise<readonly LibraryItem[]> =>
  (await loadGenreAlbumProbe(context, userId, genre, signal)).sampleAlbums

/** Enough distinct albums to be worth a Search browse tile, plus cover samples. */
export const probeBrowseGenre = async (
  context: JellyfinContext,
  userId: string,
  genre: LibraryItem,
  signal?: AbortSignal,
): Promise<BrowseGenre | null> => {
  const { sampleAlbums, albumCount } = await loadGenreAlbumProbe(
    context,
    userId,
    genre,
    signal,
    BROWSE_GENRE_MIN_ALBUMS,
  )
  if (albumCount < BROWSE_GENRE_MIN_ALBUMS) return null
  return { genre, sampleAlbums }
}

/** MusicGenre rows that have enough albums to browse. */
export const fetchBrowseGenres = async (
  context: JellyfinContext,
  userId: string,
  limit = BROWSE_GENRES_PROBE_LIMIT,
  signal?: AbortSignal,
  onProgress?: (entries: readonly BrowseGenre[]) => void,
): Promise<Result<readonly BrowseGenre[]>> => {
  const preview = await fetchMusicGenresPreview(context, userId, limit, {
    sortBy: ['Random'],
  })
  if (!preview.ok) return preview
  let published = false
  const probes = await collectBrowseGenres(
    preview.value,
    (genre) =>
      signal?.aborted
        ? Promise.resolve(null)
        : probeBrowseGenre(context, userId, genre, signal),
    {
      target: BROWSE_GENRES_CACHE_POOL_SIZE,
      shouldContinue: () => !signal?.aborted,
      onProgress: (entries) => {
        if (!onProgress) return
        if (!shouldPublishBrowseProgress(entries.length, published)) return
        published = true
        onProgress(entries)
      },
    },
  )
  if (signal?.aborted) return err(appError('cancelled', 'Request cancelled'))
  return ok(probes)
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

const MIX_ITEM_FIELDS = ['PrimaryImageAspectRatio', 'Genres', 'ParentId'] as const

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
      fields: [...MIX_ITEM_FIELDS],
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load Instant Mix', cause)
  }
}

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
      fields: [...MIX_ITEM_FIELDS],
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load artist Instant Mix', cause)
  }
}

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
      fields: [...MIX_ITEM_FIELDS],
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load genre Instant Mix', cause)
  }
}

/** Genre Instant Mix by name when the id isn't in the catalog page. */
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
      fields: [...MIX_ITEM_FIELDS],
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

/** Full artist discography (ArtistIds filter. ParentId only returns children of the artist folder). */
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
        fields: ['PrimaryImageAspectRatio', 'ParentId'],
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
      // Some servers reject /Playlists/{id}/Items. Fall back to parent Items query.
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
