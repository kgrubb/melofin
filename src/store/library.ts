import { create } from 'zustand'
import {
  shouldSyncLibrary,
  type LibrarySyncTrigger,
} from '@/src/domain/librarySync'
import {
  fetchAlbums,
  fetchArtists,
  fetchPlaylists,
  fetchSongs,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { isWifiLikeConnection } from '@/src/services/network'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

const LIBRARY_CACHE_FILE = 'library-cache.json'

export type LibraryCache = {
  readonly songs: readonly LibraryItem[]
  readonly albums: readonly LibraryItem[]
  readonly artists: readonly LibraryItem[]
  readonly playlists: readonly LibraryItem[]
  readonly syncedAt: number | null
  readonly serverUrl: string | null
}

const emptyLibraryCache = (): LibraryCache => ({
  songs: [],
  albums: [],
  artists: [],
  playlists: [],
  syncedAt: null,
  serverUrl: null,
})

type LibraryState = LibraryCache & {
  readonly hydrated: boolean
  readonly syncing: boolean
  readonly syncError: string | null
  readonly hydrate: () => Promise<void>
  readonly clearCache: () => Promise<void>
  readonly syncLibrary: (trigger: LibrarySyncTrigger) => Promise<boolean>
  readonly maybeSyncOnOpen: () => Promise<void>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ...emptyLibraryCache(),
  hydrated: false,
  syncing: false,
  syncError: null,
  hydrate: async () => {
    const cached = await readJsonFile<LibraryCache>(LIBRARY_CACHE_FILE)
    const next =
      cached.ok && cached.value
        ? {
            ...emptyLibraryCache(),
            ...cached.value,
            songs: cached.value.songs ?? [],
            albums: cached.value.albums ?? [],
            artists: cached.value.artists ?? [],
            playlists: cached.value.playlists ?? [],
          }
        : emptyLibraryCache()
    set({ ...next, hydrated: true })
  },
  clearCache: async () => {
    const empty = emptyLibraryCache()
    await writeJsonFile(LIBRARY_CACHE_FILE, empty)
    set({ ...empty, syncError: null })
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

    set({ syncing: true, syncError: null })
    const context = session.context
    const userId = session.session.userId
    const [songs, albums, artists, playlists] = await Promise.all([
      fetchSongs(context, userId),
      fetchAlbums(context, userId),
      fetchArtists(context, userId),
      fetchPlaylists(context, userId),
    ])

    const failed = [songs, albums, artists, playlists].find((result) => !result.ok)
    if (failed && !failed.ok) {
      set({ syncing: false, syncError: failed.error.message })
      return false
    }

    const next: LibraryCache = {
      songs: songs.ok ? songs.value : [],
      albums: albums.ok ? albums.value : [],
      artists: artists.ok ? artists.value : [],
      playlists: playlists.ok ? playlists.value : [],
      syncedAt: Date.now(),
      serverUrl: session.session.serverUrl,
    }
    await writeJsonFile(LIBRARY_CACHE_FILE, next)
    set({ ...next, syncing: false, syncError: null })
    return true
  },
  maybeSyncOnOpen: async () => {
    await get().hydrate()
    const session = useSessionStore.getState().session
    const cache = get()
    if (session && cache.serverUrl && cache.serverUrl !== session.serverUrl) {
      await get().clearCache()
    }
    await get().syncLibrary('open')
  },
}))
