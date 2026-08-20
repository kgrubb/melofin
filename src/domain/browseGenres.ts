import { unitRandomFromSeed } from '@/src/domain/accountScope'
import { mapPool } from '@/src/domain/asyncPool'
import type { LibraryItem } from '@/src/domain/libraryItem'
import { uniqueCollageItems } from '@/src/domain/collageArt'

export const BROWSE_GENRES_DISPLAY_LIMIT = 10
export const BROWSE_GENRES_PROBE_LIMIT = 24
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
  const ordered = [...items].sort((left, right) =>
    left.genre.id.localeCompare(right.genre.id),
  )
  return sampleBrowseGenres(
    ordered,
    limit,
    unitRandomFromSeed(ordered.map((entry) => entry.genre.id).join('|')),
  )
}

/** Probe candidates until `target` genres qualify. Skips the rest. */
export const collectBrowseGenres = async (
  candidates: readonly LibraryItem[],
  probe: (genre: LibraryItem) => Promise<BrowseGenre | null>,
  options?: {
    readonly target?: number
    readonly concurrency?: number
    readonly shouldContinue?: () => boolean
  },
): Promise<readonly BrowseGenre[]> => {
  const target = options?.target ?? BROWSE_GENRES_DISPLAY_LIMIT
  if (target <= 0 || candidates.length === 0) return []
  const found: BrowseGenre[] = []
  await mapPool(
    candidates,
    options?.concurrency ?? 6,
    async (genre) => {
      const entry = await probe(genre)
      if (entry) found.push(entry)
      return entry
    },
    {
      shouldContinue: () =>
        found.length < target && (options?.shouldContinue?.() ?? true),
    },
  )
  return found.slice(0, target)
}
