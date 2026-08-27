import { unitRandomFromSeed } from '@/src/domain/accountScope'
import { mapPool } from '@/src/domain/asyncPool'
import type { LibraryItem } from '@/src/domain/libraryItem'
import { uniqueCollageItems } from '@/src/domain/collageArt'

export const BROWSE_GENRES_DISPLAY_LIMIT = 10
/** Qualifying genres persisted for stable re-sampling across sessions. */
export const BROWSE_GENRES_CACHE_POOL_SIZE = 30
export const BROWSE_GENRES_PROBE_LIMIT = 48
export const BROWSE_GENRE_MIN_ALBUMS = 3
export const BROWSE_GENRE_ART_SAMPLES = 4
export const BROWSE_GENRE_PROBE_ALBUMS = 8

export type BrowseGenre = {
  readonly genre: LibraryItem
  readonly sampleAlbums: readonly LibraryItem[]
}

export const browseGenreAlbumCount = (
  total: number | undefined,
  itemCount: number,
): number => Math.max(Number.isFinite(total) ? Number(total) : 0, itemCount)

export const genreTileCovers = (
  albums: readonly LibraryItem[],
  fallback?: LibraryItem,
): readonly LibraryItem[] => {
  const unique = uniqueCollageItems(albums, BROWSE_GENRE_ART_SAMPLES)
  if (unique.length >= 2) return unique.slice(0, BROWSE_GENRE_ART_SAMPLES)
  const one = unique[0] ?? fallback
  return one ? [one] : []
}

const shuffleCopy = <T>(items: readonly T[], random: () => number): readonly T[] => {
  const next = [...items]
  // In-place Fisher-Yates: O(n) swaps. Immutable per-swap copies would be O(n²).
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
  }
  return next
}

/** Cap browse tiles. Pass `random` to shuffle; otherwise keep input order. */
export const sampleBrowseGenres = (
  items: readonly BrowseGenre[],
  limit = BROWSE_GENRES_DISPLAY_LIMIT,
  random?: () => number,
): readonly BrowseGenre[] => {
  if (limit <= 0 || items.length === 0) return []
  const pool = random ? shuffleCopy(items, random) : items
  return pool.slice(0, Math.min(limit, items.length))
}

/** Same genre ids → same Search tiles, regardless of fetch order. */
export const sampleBrowseGenresStable = (
  items: readonly BrowseGenre[],
  limit = BROWSE_GENRES_DISPLAY_LIMIT,
): readonly BrowseGenre[] => {
  const ordered = items.toSorted((left, right) =>
    left.genre.id.localeCompare(right.genre.id),
  )
  return sampleBrowseGenres(
    ordered,
    limit,
    unitRandomFromSeed(ordered.map((entry) => entry.genre.id).join('|')),
  )
}

/** First paint once the display grid can fill; ignore later pool growth. */
export const shouldPublishBrowseProgress = (
  entryCount: number,
  alreadyPublished: boolean,
  displayLimit = BROWSE_GENRES_DISPLAY_LIMIT,
): boolean => !alreadyPublished && entryCount >= displayLimit

/** Keep a painted grid; only replace when the screen is still empty/incomplete. */
export const mergeBrowseGenresForDisplay = (
  current: readonly BrowseGenre[],
  next: readonly BrowseGenre[],
  displayLimit = BROWSE_GENRES_DISPLAY_LIMIT,
): readonly BrowseGenre[] =>
  current.length >= displayLimit ? current : next

/** Probe candidates until `target` genres qualify. Skips the rest. */
export const collectBrowseGenres = async (
  candidates: readonly LibraryItem[],
  probe: (genre: LibraryItem) => Promise<BrowseGenre | null>,
  options?: {
    readonly target?: number
    readonly concurrency?: number
    readonly shouldContinue?: () => boolean
    readonly onProgress?: (entries: readonly BrowseGenre[]) => void
  },
): Promise<readonly BrowseGenre[]> => {
  const target = options?.target ?? BROWSE_GENRES_CACHE_POOL_SIZE
  if (target <= 0 || candidates.length === 0) return []
  const found: BrowseGenre[] = []
  await mapPool(
    candidates,
    options?.concurrency ?? 6,
    async (genre) => {
      const entry = await probe(genre)
      if (entry) {
        found.push(entry)
        options?.onProgress?.([...found])
      }
      return entry
    },
    {
      shouldContinue: () =>
        found.length < target && (options?.shouldContinue?.() ?? true),
    },
  )
  return found.slice(0, target)
}
