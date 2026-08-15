import { Platform } from 'react-native'
import { create } from 'zustand'
import {
  idleSyncProgress,
  libraryCacheBelongsToSession,
  shouldSyncLibrary,
  songDeltaWatermarkMs,
  songSyncAfterDelta,
  songSyncFetchPlan,
  songSyncPhase,
  type LibrarySyncProgress,
  type LibrarySyncTrigger,
} from '@/src/domain/librarySync'
import { backfillSongArtists } from '@/src/domain/songArtists'
import {
  removePlaylistItem,
  upsertPlaylistItem,
  type PlaylistCacheEntry,
} from '@/src/domain/playlists'
import {
  fetchAlbums,
  fetchArtists,
  fetchPlaylists,
  fetchSongsCount,
  fetchSongsSince,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import {
  fetchSongsProgressive,
  forEachSongPage,
} from '@/src/services/jellyfin/songsSync'
import { isWifiLikeConnection } from '@/src/services/network'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { usesSongNameKeyset } from '@/src/domain/libraryView'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'
import {
  clearLibraryDb,
  countSongs,
  loadSongsAfter,
  loadSongsFromLetter,
  loadSongsViewPage,
  loadSongAlphabetLetters,
  patchSongUserData,
  replaceSongs,
  songCursorOf,
  upsertSongs,
  withIncomingSongReplace,
  type SongCursor,
} from '@/src/storage/libraryDb'

const META_FILE = 'library-meta.json'
const ALBUMS_FILE = 'library-albums.json'
const ARTISTS_FILE = 'library-artists.json'
const PLAYLISTS_FILE = 'library-playlists.json'
const SONGS_FILE = 'library-songs.json'
const LEGACY_FILE = 'library-cache.json'

const SONGS_PAGE = 80
/** Bump when song row mapping changes so delta sync cannot keep stale rows. */
const SONGS_SCHEMA = 4

type LibraryMeta = {
  readonly syncedAt: number | null
  readonly serverUrl: string | null
  readonly userId: string | null
  readonly songsCount: number
  readonly songsSyncedAt: number | null
  readonly songsSchema?: number
}

export type LibraryCache = {
  readonly songs: readonly LibraryItem[]
  readonly albums: readonly LibraryItem[]
  readonly artists: readonly LibraryItem[]
  readonly playlists: readonly LibraryItem[]
  readonly syncedAt: number | null
  readonly serverUrl: string | null
  readonly userId: string | null
}

const emptyMeta = (): LibraryMeta => ({
  syncedAt: null,
  serverUrl: null,
  userId: null,
  songsCount: 0,
  songsSyncedAt: null,
})

const emptyLibraryCache = (): LibraryCache => ({
  songs: [],
  albums: [],
  artists: [],
  playlists: [],
  syncedAt: null,
  serverUrl: null,
  userId: null,
})

const asCacheEntry = (item: LibraryItem): PlaylistCacheEntry => ({
  id: item.id,
  name: item.name,
  type: item.type,
  artists: item.artists,
  durationMs: item.durationMs,
  childCount: item.childCount,
  imageTag: item.imageTag,
  imageItemId: item.imageItemId,
  overview: item.overview,
})

const fromCacheEntry = (entry: PlaylistCacheEntry): LibraryItem => ({
  id: entry.id,
  name: entry.name,
  type: entry.type,
  artists: entry.artists,
  durationMs: entry.durationMs,
  childCount: entry.childCount,
  imageTag: entry.imageTag,
  imageItemId: entry.imageItemId,
  overview: entry.overview,
})

const readSection = async (file: string): Promise<readonly LibraryItem[]> => {
  const result = await readJsonFile<readonly LibraryItem[]>(file)
  return result.ok && result.value ? result.value : []
}

const writeSection = (file: string, items: readonly LibraryItem[]) =>
  writeJsonFile(file, items)

const readMeta = async (): Promise<LibraryMeta> => {
  const result = await readJsonFile<LibraryMeta>(META_FILE)
  return result.ok && result.value ? { ...emptyMeta(), ...result.value } : emptyMeta()
}

const writeMeta = (meta: LibraryMeta) => writeJsonFile(META_FILE, meta)

const finishMeta = async (
  serverUrl: string,
  userId: string,
  songsCount: number,
  songsSyncedAt: number | null,
  songsSchema = SONGS_SCHEMA,
): Promise<LibraryMeta> => {
  const next: LibraryMeta = {
    syncedAt: Date.now(),
    serverUrl,
    userId,
    songsCount,
    songsSyncedAt,
    songsSchema,
  }
  await writeMeta(next)
  return next
}

/** Bumped on clearCache so an in-flight sync cannot write after an account switch. */
let librarySyncGen = 0

type LibraryState = LibraryCache & {
  readonly hydrated: boolean
  readonly syncing: boolean
  readonly syncProgress: LibrarySyncProgress
  readonly syncError: string | null
  readonly songsCount: number
  readonly songsCursor: SongCursor | null
  readonly songsHasMore: boolean
  readonly hydrate: () => Promise<void>
  readonly clearCache: () => Promise<void>
  readonly syncLibrary: (trigger: LibrarySyncTrigger) => Promise<boolean>
  readonly maybeSyncOnOpen: () => Promise<void>
  readonly loadMoreSongs: () => Promise<void>
  readonly jumpSongsToLetter: (letter: string) => Promise<number | null>
  readonly songAlphabetLetters: () => Promise<readonly string[]>
  readonly refreshSongsWindow: () => Promise<void>
  readonly upsertPlaylist: (item: LibraryItem) => Promise<void>
  readonly removePlaylist: (id: string) => Promise<void>
  readonly refreshPlaylists: () => Promise<boolean>
  readonly patchFavorite: (itemId: string, isFavorite: boolean) => void
  readonly patchPlayed: (itemId: string, isPlayed: boolean) => void
}

const refreshNativeWindow = async (): Promise<{
  songs: readonly LibraryItem[]
  songsCount: number
  songsCursor: SongCursor | null
  songsHasMore: boolean
}> => {
  const songsCount = await countSongs()
  const { librarySort, libraryFilter } = useSettingsStore.getState()
  if (!usesSongNameKeyset(librarySort, libraryFilter)) {
    const songs = await loadSongsViewPage(
      librarySort,
      libraryFilter,
      0,
      SONGS_PAGE,
    )
    return {
      songs,
      songsCount,
      songsCursor: null,
      songsHasMore: songs.length === SONGS_PAGE,
    }
  }
  const songs = await loadSongsAfter(null, SONGS_PAGE)
  const last = songs[songs.length - 1]
  return {
    songs,
    songsCount,
    songsCursor: last ? songCursorOf(last) : null,
    songsHasMore: songs.length < songsCount,
  }
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ...emptyLibraryCache(),
  hydrated: false,
  syncing: false,
  syncProgress: idleSyncProgress(),
  syncError: null,
  songsCount: 0,
  songsCursor: null,
  songsHasMore: false,
  hydrate: async () => {
    const legacy = await readJsonFile<LibraryCache>(LEGACY_FILE)
    if (legacy.ok && legacy.value?.songs?.length) {
      const cache = legacy.value
      await Promise.all([
        writeSection(ALBUMS_FILE, cache.albums ?? []),
        writeSection(ARTISTS_FILE, cache.artists ?? []),
        writeSection(PLAYLISTS_FILE, cache.playlists ?? []),
        writeSection(SONGS_FILE, cache.songs),
        writeMeta({
          syncedAt: cache.syncedAt,
          serverUrl: cache.serverUrl,
          userId: cache.userId ?? null,
          songsCount: cache.songs.length,
          songsSyncedAt: cache.syncedAt,
        }),
      ])
      if (Platform.OS !== 'web') await replaceSongs(cache.songs)
      await writeJsonFile(LEGACY_FILE, emptyLibraryCache())
    }

    const meta = await readMeta()
    const [albums, artists, playlists] = await Promise.all([
      readSection(ALBUMS_FILE),
      readSection(ARTISTS_FILE),
      readSection(PLAYLISTS_FILE),
    ])

    if (Platform.OS === 'web') {
      const songs = await readSection(SONGS_FILE)
      set({
        songs,
        albums,
        artists,
        playlists,
        syncedAt: meta.syncedAt,
        serverUrl: meta.serverUrl,
        userId: meta.userId ?? null,
        songsCount: songs.length,
        songsCursor: null,
        songsHasMore: false,
        hydrated: true,
      })
      return
    }

    const window = await refreshNativeWindow()
    set({
      ...window,
      albums,
      artists,
      playlists,
      syncedAt: meta.syncedAt,
      serverUrl: meta.serverUrl,
      userId: meta.userId ?? null,
      hydrated: true,
    })
  },
  clearCache: async () => {
    librarySyncGen += 1
    await Promise.all([
      writeSection(ALBUMS_FILE, []),
      writeSection(ARTISTS_FILE, []),
      writeSection(PLAYLISTS_FILE, []),
      writeSection(SONGS_FILE, []),
      writeMeta(emptyMeta()),
      clearLibraryDb(),
    ])
    set({
      ...emptyLibraryCache(),
      songsCount: 0,
      songsCursor: null,
      songsHasMore: false,
      syncing: false,
      syncProgress: idleSyncProgress(),
      syncError: null,
    })
  },
  refreshSongsWindow: async () => {
    if (Platform.OS === 'web') return
    const window = await refreshNativeWindow()
    set(window)
  },
  loadMoreSongs: async () => {
    if (Platform.OS === 'web') return
    const { songsHasMore, songsCursor, songs } = get()
    if (!songsHasMore) return
    const { librarySort, libraryFilter } = useSettingsStore.getState()
    if (!usesSongNameKeyset(librarySort, libraryFilter)) {
      const page = await loadSongsViewPage(
        librarySort,
        libraryFilter,
        songs.length,
        SONGS_PAGE,
      )
      if (page.length === 0) {
        set({ songsHasMore: false })
        return
      }
      set({
        songs: [...songs, ...page],
        songsCursor: null,
        songsHasMore: page.length === SONGS_PAGE,
      })
      return
    }
    if (!songsCursor) return
    const page = await loadSongsAfter(songsCursor, SONGS_PAGE)
    if (page.length === 0) {
      set({ songsHasMore: false })
      return
    }
    const last = page[page.length - 1]!
    const nextSongs = [...songs, ...page]
    set({
      songs: nextSongs,
      songsCursor: songCursorOf(last),
      songsHasMore: nextSongs.length < get().songsCount,
    })
  },
  songAlphabetLetters: async () => {
    if (Platform.OS === 'web') {
      const letters = new Set<string>()
      for (const song of get().songs) {
        const ch = song.name.trim().charAt(0).toLocaleUpperCase()
        letters.add(ch >= 'A' && ch <= 'Z' ? ch : '#')
      }
      return [...letters]
    }
    return loadSongAlphabetLetters()
  },
  jumpSongsToLetter: async (letter) => {
    const { songs } = get()
    const inWindow = songs.findIndex((song) => {
      const ch = song.name.trim().charAt(0).toLocaleUpperCase()
      const songLetter = ch >= 'A' && ch <= 'Z' ? ch : '#'
      return songLetter === letter
    })
    if (inWindow >= 0) return inWindow

    if (Platform.OS === 'web') return null
    const { librarySort, libraryFilter } = useSettingsStore.getState()
    if (!usesSongNameKeyset(librarySort, libraryFilter)) return null

    const page = await loadSongsFromLetter(letter, SONGS_PAGE)
    if (page.length === 0) return null
    const last = page[page.length - 1]!
    const cursor = songCursorOf(last)
    const more = await loadSongsAfter(cursor, 1)
    set({
      songs: page,
      songsCursor: cursor,
      songsHasMore: more.length > 0,
    })
    return 0
  },
  syncLibrary: async (trigger) => {
    if (get().syncing) return false
    const mode = useSettingsStore.getState().syncMode
    const isWifi = await isWifiLikeConnection()
    if (!shouldSyncLibrary({ mode, trigger, isWifi })) {
      set({
        syncError:
          mode === 'wifiOnly' && trigger === 'open'
            ? 'Library sync waits for Wi‑Fi'
            : null,
      })
      return false
    }

    const session = useSessionStore.getState()
    if (!session.context || !session.session) {
      set({ syncError: 'Sign in to sync your library' })
      return false
    }

    const syncGen = librarySyncGen
    const stillCurrent = () => librarySyncGen === syncGen

    const finish = (patch: {
      readonly syncError?: string | null
      readonly syncedAt?: number | null
      readonly serverUrl?: string | null
      readonly userId?: string | null
      readonly songsCount?: number
      readonly songs?: readonly LibraryItem[]
      readonly songsCursor?: SongCursor | null
      readonly songsHasMore?: boolean
      readonly albums?: readonly LibraryItem[]
      readonly artists?: readonly LibraryItem[]
      readonly playlists?: readonly LibraryItem[]
    } = {}) => {
      if (!stillCurrent()) return
      set({
        syncing: false,
        syncProgress: idleSyncProgress(),
        ...patch,
      })
    }

    set({
      syncing: true,
      syncError: null,
      syncProgress: { phase: 'collections', songsLoaded: 0, songsTotal: 0 },
    })
    const { context } = session
    const { userId, serverUrl } = session.session

    const [albums, artists, playlists] = await Promise.all([
      fetchAlbums(context, userId),
      fetchArtists(context, userId),
      fetchPlaylists(context, userId),
    ])
    const failed = [albums, artists, playlists].find((result) => !result.ok)
    if (failed && !failed.ok) {
      finish({ syncError: failed.error.message })
      return false
    }

    const nextAlbums = albums.ok ? albums.value : []
    const nextArtists = artists.ok ? artists.value : []
    const nextPlaylists = playlists.ok ? playlists.value : []
    if (!stillCurrent()) return false
    await Promise.all([
      writeSection(ALBUMS_FILE, nextAlbums),
      writeSection(ARTISTS_FILE, nextArtists),
      writeSection(PLAYLISTS_FILE, nextPlaylists),
    ])
    set({ albums: nextAlbums, artists: nextArtists, playlists: nextPlaylists })

    const meta = await readMeta()
    const countProbe = await fetchSongsCount(context, userId)
    if (!countProbe.ok) {
      finish({ syncError: countProbe.error.message })
      return false
    }

    const remoteCount = countProbe.value
    const localCount =
      Platform.OS === 'web' ? get().songs.length : await countSongs()
    const { songsSyncedAt } = meta
    const songsSchemaStale = (meta.songsSchema ?? 0) < SONGS_SCHEMA
    const pullStartedAt = Date.now()
    const watermarkMs = songDeltaWatermarkMs(pullStartedAt)
    const fetchPlan = songSyncFetchPlan(isWifi)

    // Delta for Sync Now and On open alike; full when schema/empty/mismatch.
    if (
      songSyncPhase({
        schemaStale: songsSchemaStale,
        songsSyncedAt,
        localCount,
      }) === 'delta'
    ) {
      set({
        syncProgress: {
          phase: 'songs',
          songsLoaded: 0,
          songsTotal: remoteCount,
        },
      })
      const delta = await fetchSongsSince(
        context,
        userId,
        new Date(songsSyncedAt!).toISOString(),
      )
      if (delta.ok) {
        const after = songSyncAfterDelta({
          remoteCount,
          localCount,
          deltaLength: delta.value.length,
        })
        if (after === 'skip') {
          if (!stillCurrent()) return false
          const nextMeta = await finishMeta(serverUrl, userId, remoteCount, watermarkMs)
          finish({
            syncedAt: nextMeta.syncedAt,
            serverUrl,
            userId,
            songsCount: remoteCount,
            syncError: null,
          })
          return true
        }
        if (delta.value.length > 0) {
          set({
            syncProgress: {
              phase: 'saving',
              songsLoaded: delta.value.length,
              songsTotal: remoteCount,
            },
          })
          const deltaSongs = backfillSongArtists(delta.value, nextAlbums)
          if (Platform.OS === 'web') {
            const byId = new Map(get().songs.map((song) => [song.id, song]))
            for (const song of deltaSongs) byId.set(song.id, song)
            const merged = [...byId.values()]
            if (
              songSyncAfterDelta({
                remoteCount,
                localCount: merged.length,
                deltaLength: delta.value.length,
              }) === 'upsertOk'
            ) {
              if (!stillCurrent()) return false
              await writeSection(SONGS_FILE, merged)
              const nextMeta = await finishMeta(
                serverUrl,
                userId,
                remoteCount,
                watermarkMs,
              )
              finish({
                songs: merged,
                songsCount: merged.length,
                songsCursor: null,
                songsHasMore: false,
                syncedAt: nextMeta.syncedAt,
                serverUrl,
                userId,
                syncError: null,
              })
              return true
            }
          } else {
            if (!stillCurrent()) return false
            await upsertSongs(deltaSongs)
            const nextCount = await countSongs()
            if (
              songSyncAfterDelta({
                remoteCount,
                localCount: nextCount,
                deltaLength: delta.value.length,
              }) === 'upsertOk'
            ) {
              const nextMeta = await finishMeta(
                serverUrl,
                userId,
                remoteCount,
                watermarkMs,
              )
              const window = await refreshNativeWindow()
              finish({
                ...window,
                syncedAt: nextMeta.syncedAt,
                serverUrl,
                userId,
                syncError: null,
              })
              return true
            }
          }
        }
      }
    }

    const reportSongProgress = (loaded: number, total: number) => {
      if (!stillCurrent()) return
      const songsTotal = total > 0 ? total : remoteCount
      const pct =
        songsTotal > 0
          ? Math.min(100, Math.floor((loaded / songsTotal) * 100))
          : 0
      const prev = get().syncProgress
      const sameTotal = prev.phase === 'songs' && prev.songsTotal === songsTotal
      const prevPct =
        sameTotal && songsTotal > 0
          ? Math.min(100, Math.floor((prev.songsLoaded / songsTotal) * 100))
          : -1
      if (sameTotal && pct === prevPct && loaded < songsTotal) return
      set({
        syncProgress: { phase: 'songs', songsLoaded: loaded, songsTotal },
      })
    }

    if (Platform.OS === 'web') {
      set({
        syncProgress: {
          phase: 'songs',
          songsLoaded: 0,
          songsTotal: remoteCount,
        },
      })
      const progressive = await fetchSongsProgressive(
        context,
        userId,
        (_page, accumulated, total) => {
          reportSongProgress(accumulated, total)
        },
        fetchPlan,
        remoteCount,
      )
      if (!progressive.ok) {
        finish({ syncError: progressive.error.message })
        return false
      }
      if (progressive.value.length === 0 && remoteCount > 0) {
        finish({
          syncError: 'Song catalog pull returned no items',
        })
        return false
      }
      set({
        syncProgress: {
          phase: 'saving',
          songsLoaded: progressive.value.length,
          songsTotal: progressive.value.length,
        },
      })
      const webSongs = backfillSongArtists(progressive.value, nextAlbums)
      if (!stillCurrent()) return false
      await writeSection(SONGS_FILE, webSongs)
      const nextMeta = await finishMeta(serverUrl, userId, webSongs.length, watermarkMs)
      finish({
        songs: webSongs,
        songsCount: webSongs.length,
        songsCursor: null,
        songsHasMore: false,
        albums: nextAlbums,
        artists: nextArtists,
        playlists: nextPlaylists,
        syncedAt: nextMeta.syncedAt,
        serverUrl,
        userId,
        syncError: null,
      })
      return true
    }

    // Native: stage into songs_incoming, swap only on success (rural-safe).
    if (!stillCurrent()) return false
    set({
      syncProgress: { phase: 'songs', songsLoaded: 0, songsTotal: remoteCount },
    })
    try {
      await withIncomingSongReplace(async (append) => {
        const streamed = await forEachSongPage(
          context,
          userId,
          fetchPlan,
          async (page, loaded, total) => {
            if (!stillCurrent()) throw new Error('sync superseded')
            await append(backfillSongArtists(page, nextAlbums))
            reportSongProgress(loaded, total)
          },
          remoteCount,
        )
        if (!stillCurrent()) throw new Error('sync superseded')
        if (!streamed.ok) throw new Error(streamed.error.message)
        if (streamed.value === 0 && remoteCount > 0) {
          throw new Error('Song catalog pull returned no items')
        }
      })
    } catch (cause) {
      const window = await refreshNativeWindow()
      finish({
        ...window,
        syncError:
          cause instanceof Error ? cause.message : 'Library sync failed',
      })
      return false
    }

    const savedCount = await countSongs()
    if (!stillCurrent()) return false
    set({
      syncProgress: {
        phase: 'saving',
        songsLoaded: savedCount,
        songsTotal: savedCount,
      },
    })
    const nextMeta = await finishMeta(serverUrl, userId, savedCount, watermarkMs)
    const window = await refreshNativeWindow()
    finish({
      ...window,
      albums: nextAlbums,
      artists: nextArtists,
      playlists: nextPlaylists,
      syncedAt: nextMeta.syncedAt,
      serverUrl,
      userId,
      syncError: null,
    })
    return true
  },
  maybeSyncOnOpen: async () => {
    await get().hydrate()
    const session = useSessionStore.getState().session
    const cache = get()
    const switched = Boolean(
      session && !libraryCacheBelongsToSession(cache, session),
    )
    if (switched) await get().clearCache()
    if (session) {
      await useSettingsStore
        .getState()
        .activateAccountScope(session.serverUrl, session.userId)
    }
    await get().syncLibrary(switched ? 'manual' : 'open')
  },
  upsertPlaylist: async (item) => {
    const playlists = upsertPlaylistItem(
      get().playlists.map(asCacheEntry),
      asCacheEntry(item),
    ).map(fromCacheEntry)
    await writeSection(PLAYLISTS_FILE, playlists)
    set({ playlists })
  },
  removePlaylist: async (id) => {
    const playlists = removePlaylistItem(
      get().playlists.map(asCacheEntry),
      id,
    ).map(fromCacheEntry)
    await writeSection(PLAYLISTS_FILE, playlists)
    set({ playlists })
  },
  refreshPlaylists: async () => {
    const session = useSessionStore.getState()
    if (!session.context || !session.session) return false
    const result = await fetchPlaylists(session.context, session.session.userId)
    if (!result.ok) return false
    await writeSection(PLAYLISTS_FILE, result.value)
    set({ playlists: result.value, syncError: null })
    return true
  },
  patchFavorite: (itemId, isFavorite) => {
    set((state) => ({
      songs: state.songs.map((song) =>
        song.id === itemId ? { ...song, isFavorite } : song,
      ),
    }))
    if (Platform.OS !== 'web') {
      void patchSongUserData(itemId, { isFavorite })
    }
  },
  patchPlayed: (itemId, isPlayed) => {
    const lastPlayedMs = isPlayed ? Date.now() : null
    set((state) => ({
      songs: state.songs.map((song) =>
        song.id === itemId
          ? {
              ...song,
              isPlayed,
              lastPlayedMs: lastPlayedMs ?? undefined,
            }
          : song,
      ),
    }))
    if (Platform.OS !== 'web') {
      void patchSongUserData(itemId, { isPlayed, lastPlayedMs })
    }
  },
}))
