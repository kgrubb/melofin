import type { LibraryItem } from '@/src/domain/libraryItem'

export type SearchFilter = 'all' | 'songs' | 'albums' | 'artists' | 'playlists'

export const SEARCH_FILTERS: readonly SearchFilter[] = [
  'all',
  'songs',
  'albums',
  'artists',
  'playlists',
]

export type GroupedSearch = {
  readonly songs: readonly LibraryItem[]
  readonly albums: readonly LibraryItem[]
  readonly artists: readonly LibraryItem[]
  readonly playlists: readonly LibraryItem[]
}

export type SearchSection = {
  readonly title: string
  readonly data: readonly LibraryItem[]
}

export const groupSearchResults = (
  items: readonly LibraryItem[],
): GroupedSearch => ({
  songs: items.filter((item) => item.type === 'Audio'),
  albums: items.filter((item) => item.type === 'MusicAlbum'),
  artists: items.filter((item) => item.type === 'MusicArtist'),
  playlists: items.filter((item) => item.type === 'Playlist'),
})

const FILTER_TITLE: Readonly<Record<Exclude<SearchFilter, 'all'>, string>> = {
  songs: 'Songs',
  albums: 'Albums',
  artists: 'Artists',
  playlists: 'Playlists',
}

export const searchSections = (
  grouped: GroupedSearch,
  filter: SearchFilter,
): readonly SearchSection[] => {
  const rows: readonly (SearchSection & { readonly key: Exclude<SearchFilter, 'all'> })[] =
    [
      { key: 'songs', title: FILTER_TITLE.songs, data: grouped.songs },
      { key: 'albums', title: FILTER_TITLE.albums, data: grouped.albums },
      { key: 'artists', title: FILTER_TITLE.artists, data: grouped.artists },
      { key: 'playlists', title: FILTER_TITLE.playlists, data: grouped.playlists },
    ]
  const visible = filter === 'all' ? rows : rows.filter((row) => row.key === filter)
  return visible
    .filter((row) => row.data.length > 0)
    .map(({ title, data }) => ({ title, data }))
}

export const groupedSearchCount = (grouped: GroupedSearch): number =>
  grouped.songs.length +
  grouped.albums.length +
  grouped.artists.length +
  grouped.playlists.length

export type SearchListRow =
  | { readonly kind: 'header'; readonly title: string }
  | { readonly kind: 'item'; readonly item: LibraryItem }

export const flattenSearchSections = (
  sections: readonly SearchSection[],
  showHeaders: boolean,
): readonly SearchListRow[] =>
  sections.flatMap((section) => [
    ...(showHeaders ? [{ kind: 'header' as const, title: section.title }] : []),
    ...section.data.map((item) => ({ kind: 'item' as const, item })),
  ])
