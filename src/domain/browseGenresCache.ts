import { accountScopeKey } from '@/src/domain/accountScope'
import type { BrowseGenre } from '@/src/domain/browseGenres'
import { uniqueCollageItems } from '@/src/domain/collageArt'
import type { LibraryItem } from '@/src/domain/libraryItem'

export const BROWSE_GENRES_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Bump when browse eligibility or tile payload changes. */
export const BROWSE_GENRES_CACHE_VERSION = 6

type CachedArt = {
  readonly id: string
  readonly imageTag?: string
  readonly imageItemId?: string
}

type PersistedBrowseGenres = {
  readonly genres?: readonly unknown[]
  readonly savedAt?: number
  readonly version?: number
}

export type LoadedBrowseGenres = {
  readonly items: readonly BrowseGenre[]
  readonly savedAt: number | undefined
  readonly version: number | undefined
}

export const browseGenresCachePath = (serverUrl: string, userId: string): string =>
  `browse-genres-${accountScopeKey({ serverUrl, userId })}.json`

const isCachedArt = (value: unknown): value is CachedArt =>
  Boolean(value && typeof value === 'object' && typeof (value as CachedArt).id === 'string' && (value as CachedArt).id.length > 0)

const artPatch = (entry: CachedArt) => ({
  ...(entry.imageTag ? { imageTag: entry.imageTag } : {}),
  ...(entry.imageItemId ? { imageItemId: entry.imageItemId } : {}),
})

const albumFromCache = (entry: CachedArt): LibraryItem => ({
  id: entry.id,
  name: entry.id,
  type: 'MusicAlbum',
  artists: [],
  durationMs: 0,
  ...artPatch(entry),
})

const genreFromCache = (entry: CachedArt & { readonly name: string }): LibraryItem => ({
  id: entry.id,
  name: entry.name,
  type: 'MusicGenre',
  artists: [],
  durationMs: 0,
  ...artPatch(entry),
})

export const parseBrowseGenresCache = (value: unknown): LoadedBrowseGenres => {
  if (!value || typeof value !== 'object') {
    return { items: [], savedAt: undefined, version: undefined }
  }
  const payload = value as PersistedBrowseGenres
  const savedAt = payload.savedAt
  const items = Array.isArray(payload.genres)
    ? payload.genres.flatMap((row) => {
        if (!isCachedArt(row) || typeof (row as { name?: unknown }).name !== 'string') {
          return []
        }
        const entry = row as CachedArt & { readonly name: string; readonly sampleAlbums?: unknown }
        const sampleAlbums = Array.isArray(entry.sampleAlbums)
          ? entry.sampleAlbums.filter(isCachedArt).map(albumFromCache)
          : []
        return [{ genre: genreFromCache(entry), sampleAlbums: uniqueCollageItems(sampleAlbums) }]
      })
    : []
  return {
    items,
    savedAt:
      typeof savedAt === 'number' && Number.isFinite(savedAt) && savedAt > 0
        ? savedAt
        : undefined,
    version:
      typeof payload.version === 'number' && Number.isFinite(payload.version)
        ? payload.version
        : undefined,
  }
}

export const isBrowseGenresCacheFresh = (
  savedAtMs: number | undefined,
  nowMs = Date.now(),
): boolean =>
  typeof savedAtMs === 'number' &&
  Number.isFinite(savedAtMs) &&
  savedAtMs > 0 &&
  nowMs - savedAtMs >= 0 &&
  nowMs - savedAtMs < BROWSE_GENRES_CACHE_MAX_AGE_MS

/** Skip the expensive Jellyfin probe when a non-empty cache is still fresh. */
export const shouldRefreshBrowseGenres = (
  cache: LoadedBrowseGenres,
  nowMs = Date.now(),
): boolean => {
  if (cache.version !== BROWSE_GENRES_CACHE_VERSION) return true
  if (cache.items.length === 0) return true
  return !isBrowseGenresCacheFresh(cache.savedAt, nowMs)
}

export const serializeBrowseGenresCache = (
  items: readonly BrowseGenre[],
  savedAt = Date.now(),
): PersistedBrowseGenres => ({
  version: BROWSE_GENRES_CACHE_VERSION,
  savedAt,
  genres: items.map(({ genre, sampleAlbums }) => ({
    id: genre.id,
    name: genre.name,
    ...artPatch(genre),
    sampleAlbums: uniqueCollageItems(sampleAlbums).map((album) => ({
      id: album.id,
      ...artPatch(album),
    })),
  })),
})
