import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api'
import { getInstantMixApi } from '@jellyfin/sdk/lib/utils/api/instant-mix-api'
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api'
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api'
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind'
import type { ItemFilter } from '@jellyfin/sdk/lib/generated-client/models/item-filter'
import type { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by'
import type { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  dedupeLibraryItems,
  dedupePlaylistTracks,
  LIBRARY_PAGE_SIZE,
  shouldFetchNextPage,
} from '@/src/services/jellyfin/libraryPaging'
import { mapBaseItem, type LibraryItem } from '@/src/services/jellyfin/mappers'

export type { LibraryItem } from '@/src/services/jellyfin/mappers'
export {
  artworkUrl,
  audioAuthHeaders,
  buildAudioStreamUrl,
  buildPlaybackStreamCandidates,
  buildUniversalStreamUrl,
  toQueueTrack,
  userImageUrl,
} from '@/src/services/jellyfin/mappers'

const mapItems = (items: unknown[] | undefined): readonly LibraryItem[] =>
  (items ?? []).map((item) => mapBaseItem(item as Record<string, unknown>))

const fail = (message: string, cause: unknown) =>
  err(appError('network', message, cause))

type ItemQuery = {
  readonly userId: string
  readonly includeItemTypes: readonly BaseItemKind[]
  readonly recursive?: boolean
  readonly sortBy?: readonly ItemSortBy[]
  readonly sortOrder?: readonly SortOrder[]
  readonly filters?: readonly ItemFilter[]
  readonly parentId?: string
  readonly searchTerm?: string
}

type Page = {
  readonly items: readonly LibraryItem[]
  readonly total: number
}

const fetchItemsPage = async (
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
        enableImages: true,
        fields: ['PrimaryImageAspectRatio'],
        startIndex,
        limit,
      },
      signal ? { signal } : undefined,
    )
    return ok({
      items: mapItems(response.data.Items),
      total: Number(response.data.TotalRecordCount ?? 0),
    })
  } catch (cause) {
    if ((cause as { name?: string }).name === 'CanceledError') {
      return err(appError('cancelled', 'Request cancelled', cause))
    }
    return fail('Failed to load library', cause)
  }
}

const fetchAllItemPages = async (
  context: JellyfinContext,
  query: ItemQuery,
  startIndex = 0,
  acc: readonly LibraryItem[] = [],
): Promise<Result<readonly LibraryItem[]>> => {
  const page = await fetchItemsPage(context, query, startIndex, LIBRARY_PAGE_SIZE)
  if (!page.ok) return page
  const merged = [...acc, ...page.value.items]
  if (
    !shouldFetchNextPage(
      startIndex,
      page.value.items.length,
      page.value.total,
      LIBRARY_PAGE_SIZE,
    )
  ) {
    return ok(dedupeLibraryItems(merged))
  }
  return fetchAllItemPages(
    context,
    query,
    startIndex + page.value.items.length,
    merged,
  )
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

export const fetchInstantMix = async (
  context: JellyfinContext,
  userId: string,
  itemId: string,
): Promise<Result<readonly LibraryItem[]>> => {
  try {
    const response = await getInstantMixApi(context.api).getInstantMixFromItem({
      itemId,
      userId,
      limit: 24,
    })
    return ok(dedupeLibraryItems(mapItems(response.data.Items)))
  } catch (cause) {
    return fail('Failed to load Listen Now', cause)
  }
}

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
      if (!shouldFetchNextPage(startIndex, page.length, total, pageSize)) {
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
