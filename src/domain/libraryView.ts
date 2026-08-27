export type LibraryViewItem = {
  readonly id: string
  readonly name: string
  readonly isFavorite?: boolean
  readonly isPlayed?: boolean
  readonly dateCreatedMs?: number
  readonly lastPlayedMs?: number
}

export type LibrarySort = 'name' | 'dateAdded' | 'recentlyPlayed'
export type LibraryFilter = 'all' | 'favorites' | 'unplayed'

export const LIBRARY_SORTS: readonly LibrarySort[] = [
  'name',
  'dateAdded',
  'recentlyPlayed',
] as const

export const LIBRARY_FILTERS: readonly LibraryFilter[] = [
  'all',
  'favorites',
  'unplayed',
] as const

export const librarySortLabel = (sort: LibrarySort): string => {
  if (sort === 'name') return 'Name'
  if (sort === 'dateAdded') return 'Date added'
  return 'Recently played'
}

export const libraryFilterLabel = (filter: LibraryFilter): string => {
  if (filter === 'all') return 'All'
  if (filter === 'favorites') return 'Favorites'
  return 'Unplayed'
}

export const isLibrarySort = (value: unknown): value is LibrarySort =>
  value === 'name' || value === 'dateAdded' || value === 'recentlyPlayed'

export const isLibraryFilter = (value: unknown): value is LibraryFilter =>
  value === 'all' || value === 'favorites' || value === 'unplayed'

const compareName = (a: LibraryViewItem, b: LibraryViewItem): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export const filterLibraryItems = <T extends LibraryViewItem>(
  items: readonly T[],
  filter: LibraryFilter,
): readonly T[] => {
  if (filter === 'favorites') return items.filter((item) => item.isFavorite)
  if (filter === 'unplayed') return items.filter((item) => item.isPlayed !== true)
  return items
}

export const sortLibraryItems = <T extends LibraryViewItem>(
  items: readonly T[],
  sort: LibrarySort,
): readonly T[] => {
  if (sort === 'name') {
    return items.toSorted(compareName)
  }
  if (sort === 'dateAdded') {
    return items.toSorted((a, b) => {
      const av = a.dateCreatedMs ?? 0
      const bv = b.dateCreatedMs ?? 0
      if (bv !== av) return bv - av
      return compareName(a, b)
    })
  }
  return items.toSorted((a, b) => {
    const av = a.lastPlayedMs ?? 0
    const bv = b.lastPlayedMs ?? 0
    if (bv !== av) return bv - av
    return compareName(a, b)
  })
}

export const applyLibraryView = <T extends LibraryViewItem>(
  items: readonly T[],
  sort: LibrarySort,
  filter: LibraryFilter,
): readonly T[] => sortLibraryItems(filterLibraryItems(items, filter), sort)

/** Native Songs keyset paging is name + all. Other views need SQL ORDER/WHERE. */
export const usesSongNameKeyset = (
  sort: LibrarySort,
  filter: LibraryFilter,
): boolean => sort === 'name' && filter === 'all'
