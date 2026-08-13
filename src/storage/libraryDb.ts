import { Platform } from 'react-native'
import type { LibraryItem } from '@/src/services/jellyfin/mappers'

type SqlDatabase = {
  execAsync: (source: string) => Promise<void>
  runAsync: (source: string, ...params: unknown[]) => Promise<unknown>
  getFirstAsync: <T>(source: string, ...params: unknown[]) => Promise<T | null>
  getAllAsync: <T>(source: string, ...params: unknown[]) => Promise<T[]>
}

let dbPromise: Promise<SqlDatabase | null> | null = null

const ensureSongColumns = async (db: SqlDatabase): Promise<void> => {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(songs)')
  const have = new Set(cols.map((c) => c.name))
  const add = async (name: string, ddl: string) => {
    if (have.has(name)) return
    await db.execAsync(`ALTER TABLE songs ADD COLUMN ${ddl}`)
  }
  await add('is_favorite', 'is_favorite INTEGER')
  await add('is_played', 'is_played INTEGER')
  await add('date_created_ms', 'date_created_ms INTEGER')
  await add('last_played_ms', 'last_played_ms INTEGER')
  await add('normalization_gain', 'normalization_gain REAL')
  await add('has_lyrics', 'has_lyrics INTEGER')
}

export const patchSongUserData = async (
  id: string,
  patch: {
    readonly isFavorite?: boolean
    readonly isPlayed?: boolean
    readonly lastPlayedMs?: number | null
  },
): Promise<void> => {
  const db = await openDb()
  if (!db) return
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.isFavorite !== undefined) {
    sets.push('is_favorite = ?')
    params.push(patch.isFavorite ? 1 : 0)
  }
  if (patch.isPlayed !== undefined) {
    sets.push('is_played = ?')
    params.push(patch.isPlayed ? 1 : 0)
  }
  if (patch.lastPlayedMs !== undefined) {
    sets.push('last_played_ms = ?')
    params.push(patch.lastPlayedMs)
  }
  if (sets.length === 0) return
  params.push(id)
  await db.runAsync(`UPDATE songs SET ${sets.join(', ')} WHERE id = ?`, ...params)
}

const openDb = async (): Promise<SqlDatabase | null> => {
  if (Platform.OS === 'web') return null
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const SQLite = await import('expo-sqlite')
        if (typeof SQLite.openDatabaseAsync !== 'function') return null
        const db = await SQLite.openDatabaseAsync('melio-library.db')
        await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS songs (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          artists_json TEXT NOT NULL,
          album TEXT,
          album_id TEXT,
          artist_id TEXT,
          overview TEXT,
          duration_ms INTEGER NOT NULL,
          image_tag TEXT,
          image_item_id TEXT,
          media_source_id TEXT,
          child_count INTEGER,
          sort_name TEXT NOT NULL,
          is_favorite INTEGER,
          is_played INTEGER,
          date_created_ms INTEGER,
          last_played_ms INTEGER,
          normalization_gain REAL,
          has_lyrics INTEGER
        );
        CREATE INDEX IF NOT EXISTS songs_sort ON songs(sort_name, id);
      `)
        const sql = db as SqlDatabase
        await ensureSongColumns(sql)
        return sql
      } catch {
        // Expo Go / missing native binary — Songs stay in-memory/JSON until a rebuild.
        return null
      }
    })()
  }
  return dbPromise
}

const rowToSong = (row: Record<string, unknown>): LibraryItem => ({
  id: String(row.id),
  name: String(row.name),
  type: String(row.type),
  artists: JSON.parse(String(row.artists_json || '[]')) as string[],
  album: row.album != null ? String(row.album) : undefined,
  albumId: row.album_id != null ? String(row.album_id) : undefined,
  artistId: row.artist_id != null ? String(row.artist_id) : undefined,
  overview: row.overview != null ? String(row.overview) : undefined,
  durationMs: Number(row.duration_ms ?? 0),
  imageTag: row.image_tag != null ? String(row.image_tag) : undefined,
  imageItemId: row.image_item_id != null ? String(row.image_item_id) : undefined,
  mediaSourceId: row.media_source_id != null ? String(row.media_source_id) : undefined,
  childCount: row.child_count != null ? Number(row.child_count) : undefined,
  isFavorite: row.is_favorite == null ? undefined : Boolean(row.is_favorite),
  isPlayed: row.is_played == null ? undefined : Boolean(row.is_played),
  dateCreatedMs:
    row.date_created_ms == null ? undefined : Number(row.date_created_ms),
  lastPlayedMs:
    row.last_played_ms == null ? undefined : Number(row.last_played_ms),
  normalizationGain:
    row.normalization_gain == null ? undefined : Number(row.normalization_gain),
  hasLyrics: row.has_lyrics == null ? undefined : Boolean(row.has_lyrics),
})

const songSortName = (song: LibraryItem): string => song.name.toLocaleLowerCase()

const insertSong = async (db: SqlDatabase, song: LibraryItem) => {
  await db.runAsync(
    `INSERT OR REPLACE INTO songs (
      id, name, type, artists_json, album, album_id, artist_id, overview,
      duration_ms, image_tag, image_item_id, media_source_id, child_count, sort_name,
      is_favorite, is_played, date_created_ms, last_played_ms, normalization_gain, has_lyrics
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    song.id,
    song.name,
    song.type,
    JSON.stringify(song.artists),
    song.album ?? null,
    song.albumId ?? null,
    song.artistId ?? null,
    song.overview ?? null,
    song.durationMs,
    song.imageTag ?? null,
    song.imageItemId ?? null,
    song.mediaSourceId ?? null,
    song.childCount ?? null,
    songSortName(song),
    song.isFavorite == null ? null : song.isFavorite ? 1 : 0,
    song.isPlayed == null ? null : song.isPlayed ? 1 : 0,
    song.dateCreatedMs ?? null,
    song.lastPlayedMs ?? null,
    song.normalizationGain ?? null,
    song.hasLyrics == null ? null : song.hasLyrics ? 1 : 0,
  )
}

const withTx = async (db: SqlDatabase, run: () => Promise<void>) => {
  await db.execAsync('BEGIN')
  try {
    await run()
    await db.execAsync('COMMIT')
  } catch (cause) {
    await db.execAsync('ROLLBACK')
    throw cause
  }
}

const INSERT_CHUNK = 80

const insertSongs = async (
  db: SqlDatabase,
  songs: readonly LibraryItem[],
): Promise<void> => {
  for (let i = 0; i < songs.length; i += INSERT_CHUNK) {
    const chunk = songs.slice(i, i + INSERT_CHUNK)
    await Promise.all(chunk.map((song) => insertSong(db, song)))
  }
}

export const replaceSongs = async (songs: readonly LibraryItem[]): Promise<void> => {
  const db = await openDb()
  if (!db) return
  await withTx(db, async () => {
    await db.execAsync('DELETE FROM songs')
    await insertSongs(db, songs)
  })
}

export const upsertSongs = async (songs: readonly LibraryItem[]): Promise<void> => {
  const db = await openDb()
  if (!db) return
  await withTx(db, async () => {
    await insertSongs(db, songs)
  })
}

export const countSongs = async (): Promise<number> => {
  const db = await openDb()
  if (!db) return 0
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM songs')
  return Number(row?.c ?? 0)
}

/** @deprecated Prefer keyset pages; kept for web migration / rare full reads. */
export const loadAllSongs = async (): Promise<readonly LibraryItem[]> => {
  const db = await openDb()
  if (!db) return []
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM songs ORDER BY sort_name ASC, id ASC',
  )
  return rows.map(rowToSong)
}

export type SongCursor = {
  readonly sortName: string
  readonly id: string
}

export const loadSongsAfter = async (
  cursor: SongCursor | null,
  limit: number,
): Promise<readonly LibraryItem[]> => {
  const db = await openDb()
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(limit, 500))
  if (!cursor) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM songs ORDER BY sort_name ASC, id ASC LIMIT ?',
      safeLimit,
    )
    return rows.map(rowToSong)
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM songs
     WHERE (sort_name > ?) OR (sort_name = ? AND id > ?)
     ORDER BY sort_name ASC, id ASC
     LIMIT ?`,
    cursor.sortName,
    cursor.sortName,
    cursor.id,
    safeLimit,
  )
  return rows.map(rowToSong)
}

export const loadSongIdPageAfter = async (
  cursor: SongCursor | null,
  limit: number,
): Promise<readonly SongCursor[]> => {
  const db = await openDb()
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(limit, 2000))
  if (!cursor) {
    const rows = await db.getAllAsync<{ id: string; sort_name: string }>(
      'SELECT id, sort_name FROM songs ORDER BY sort_name ASC, id ASC LIMIT ?',
      safeLimit,
    )
    return rows.map((row) => ({ id: row.id, sortName: row.sort_name }))
  }
  const rows = await db.getAllAsync<{ id: string; sort_name: string }>(
    `SELECT id, sort_name FROM songs
     WHERE (sort_name > ?) OR (sort_name = ? AND id > ?)
     ORDER BY sort_name ASC, id ASC
     LIMIT ?`,
    cursor.sortName,
    cursor.sortName,
    cursor.id,
    safeLimit,
  )
  return rows.map((row) => ({ id: row.id, sortName: row.sort_name }))
}

export const loadSongsByIds = async (
  ids: readonly string[],
): Promise<readonly LibraryItem[]> => {
  const db = await openDb()
  if (!db || ids.length === 0) return []
  const byId = new Map<string, LibraryItem>()
  const chunkSize = 200
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => '?').join(',')
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM songs WHERE id IN (${placeholders})`,
      ...chunk,
    )
    for (const row of rows) {
      const song = rowToSong(row)
      byId.set(song.id, song)
    }
  }
  return ids.flatMap((id) => {
    const song = byId.get(id)
    return song ? [song] : []
  })
}

export const songCursorOf = (song: LibraryItem): SongCursor => ({
  sortName: songSortName(song),
  id: song.id,
})

/** Page of the full A–Z song list starting at a section-index letter. */
export const loadSongsFromLetter = async (
  letter: string,
  limit: number,
): Promise<readonly LibraryItem[]> => {
  const db = await openDb()
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(limit, 500))
  // `#` is the leading non a–z block — open the catalog from the top.
  if (letter === '#') {
    return loadSongsAfter(null, safeLimit)
  }
  const start = letter.trim().toLowerCase().charAt(0)
  if (!start || start < 'a' || start > 'z') return []
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM songs
     WHERE sort_name >= ?
     ORDER BY sort_name ASC, id ASC
     LIMIT ?`,
    start,
    safeLimit,
  )
  return rows.map(rowToSong)
}

/** Letters that exist in the on-device song catalog (for section index). */
export const loadSongAlphabetLetters = async (): Promise<readonly string[]> => {
  const db = await openDb()
  if (!db) return []
  const rows = await db.getAllAsync<{ letter: string }>(
    `SELECT DISTINCT
       CASE
         WHEN substr(sort_name, 1, 1) GLOB '[a-z]' THEN upper(substr(sort_name, 1, 1))
         ELSE '#'
       END AS letter
     FROM songs`,
  )
  return rows.map((row) => row.letter)
}

export const clearLibraryDb = async (): Promise<void> => {
  const db = await openDb()
  if (!db) return
  await db.execAsync('DELETE FROM songs;')
}
