import type { LibraryItem } from '@/src/domain/libraryItem'
import { accountScopeKey } from '@/src/domain/accountScope'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

export type HomeRailsSnapshot = {
  readonly albums: readonly LibraryItem[]
  readonly resume: readonly LibraryItem[]
  readonly playlists: readonly LibraryItem[]
  readonly favorites: readonly LibraryItem[]
  readonly favoriteArtists: readonly LibraryItem[]
  readonly genres: readonly LibraryItem[]
  readonly savedAt?: number
}

const railsPath = (serverUrl: string, userId: string): string =>
  `home-rails-${accountScopeKey({ serverUrl, userId })}.json`

const isItem = (value: unknown): value is LibraryItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as LibraryItem
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.name === 'string' &&
    typeof item.type === 'string' &&
    Array.isArray(item.artists)
  )
}

const items = (value: unknown): readonly LibraryItem[] =>
  Array.isArray(value) ? value.filter(isItem) : []

export const emptyHomeRails = (): HomeRailsSnapshot => ({
  albums: [],
  resume: [],
  playlists: [],
  favorites: [],
  favoriteArtists: [],
  genres: [],
})

export const homeRailsHasContent = (rails: HomeRailsSnapshot): boolean =>
  rails.albums.length > 0 ||
  rails.resume.length > 0 ||
  rails.playlists.length > 0 ||
  rails.favorites.length > 0 ||
  rails.favoriteArtists.length > 0 ||
  rails.genres.length > 0

export const loadPersistedHomeRails = async (
  serverUrl: string,
  userId: string,
): Promise<HomeRailsSnapshot> => {
  const result = await readJsonFile<HomeRailsSnapshot>(railsPath(serverUrl, userId))
  if (!result.ok || !result.value) return emptyHomeRails()
  const savedAt = result.value.savedAt
  return {
    albums: items(result.value.albums),
    resume: items(result.value.resume),
    playlists: items(result.value.playlists),
    favorites: items(result.value.favorites),
    favoriteArtists: items(result.value.favoriteArtists),
    genres: items(result.value.genres),
    savedAt:
      typeof savedAt === 'number' && Number.isFinite(savedAt) && savedAt > 0
        ? savedAt
        : undefined,
  }
}

export const persistHomeRails = async (
  serverUrl: string,
  userId: string,
  rails: HomeRailsSnapshot,
): Promise<void> => {
  await writeJsonFile(railsPath(serverUrl, userId), {
    ...rails,
    savedAt: rails.savedAt ?? Date.now(),
  })
}
