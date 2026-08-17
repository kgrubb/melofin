import type { LibraryItem } from '@/src/services/jellyfin/mappers'
import type { LibraryFilter, LibrarySort } from '@/src/domain/libraryView'

/** Browser preview has no SQLite. Songs stay empty until a native build. */
export const patchSongUserData = async (
  _id: string,
  _patch: {
    readonly isFavorite?: boolean
    readonly isPlayed?: boolean
    readonly lastPlayedMs?: number | null
  },
): Promise<void> => undefined

export const replaceSongs = async (_songs: readonly LibraryItem[]): Promise<void> =>
  undefined

export const upsertSongs = async (_songs: readonly LibraryItem[]): Promise<void> =>
  undefined

export const withIncomingSongReplace = async (
  fill: (append: (songs: readonly LibraryItem[]) => Promise<void>) => Promise<void>,
): Promise<void> => {
  await fill(async () => undefined)
}

export const countSongs = async (): Promise<number> => 0

export const loadAllSongs = async (): Promise<readonly LibraryItem[]> => []

export type SongCursor = {
  readonly sortName: string
  readonly id: string
}

export const loadSongsAfter = async (
  _cursor: SongCursor | null,
  _limit: number,
): Promise<readonly LibraryItem[]> => []

export const loadSongsViewPage = async (
  _sort: LibrarySort,
  _filter: LibraryFilter,
  _offset: number,
  _limit: number,
): Promise<readonly LibraryItem[]> => []

export const loadSongIdPageAfter = async (
  _cursor: SongCursor | null,
  _limit: number,
): Promise<readonly SongCursor[]> => []

export const loadSongsByIds = async (
  _ids: readonly string[],
): Promise<readonly LibraryItem[]> => []

export const songCursorOf = (song: LibraryItem): SongCursor => ({
  sortName: song.name.toLocaleLowerCase(),
  id: song.id,
})

export const loadSongsFromLetter = async (
  _letter: string,
  _limit: number,
): Promise<readonly LibraryItem[]> => []

export const loadSongAlphabetLetters = async (): Promise<readonly string[]> => []

export const clearLibraryDb = async (): Promise<void> => undefined
