import {
  browseGenresCachePath,
  parseBrowseGenresCache,
  serializeBrowseGenresCache,
  type LoadedBrowseGenres,
} from '@/src/domain/browseGenresCache'
import type { BrowseGenre } from '@/src/domain/browseGenres'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

export const loadPersistedBrowseGenres = async (
  serverUrl: string,
  userId: string,
): Promise<LoadedBrowseGenres> => {
  const result = await readJsonFile(browseGenresCachePath(serverUrl, userId))
  return parseBrowseGenresCache(result.ok ? result.value : null)
}

export const persistBrowseGenres = async (
  serverUrl: string,
  userId: string,
  items: readonly BrowseGenre[],
  savedAt = Date.now(),
): Promise<void> => {
  await writeJsonFile(
    browseGenresCachePath(serverUrl, userId),
    serializeBrowseGenresCache(items, savedAt),
  )
}
