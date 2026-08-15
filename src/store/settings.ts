import { create } from 'zustand'
import {
  defaultBudgetBytes,
  emptyOfflineIndex,
  type OfflineIndex,
} from '@/src/domain/offline'
import { type LibrarySyncMode } from '@/src/domain/librarySync'
import {
  isLibraryFilter,
  isLibrarySort,
  type LibraryFilter,
  type LibrarySort,
} from '@/src/domain/libraryView'
import {
  isReplayGainMode,
  type ReplayGainMode,
} from '@/src/domain/replayGain'
import {
  defaultEqSettings,
  parseEqSettings,
  type EqSettings,
} from '@/src/domain/eqPresets'
import {
  accountScopeKey,
  scopedPacksRelativePath,
} from '@/src/domain/accountScope'
import {
  emptySyncPackIndex,
  parseSyncPackIndex,
  type SyncPackIndex,
} from '@/src/domain/syncPack'
import {
  defaultStreamQuality,
  parseStreamQuality,
  type QualityPreset,
  type StreamQualitySettings,
} from '@/src/domain/streamQuality'
import {
  normalizeCrossfadeSeconds,
  type CrossfadeSeconds,
} from '@/src/domain/crossfade'
import {
  clearOfflineCache,
  getMemoryOfflineIndex,
  persistOfflineIndex,
  setOfflineIndexPublishHandler,
  stampOfflineScope,
} from '@/src/offline/downloader'
import { deleteFile, readJsonFile, resolveOfflineFileUri, writeJsonFile } from '@/src/storage/jsonFile'

type Settings = {
  readonly prefetchEnabled: boolean
  readonly budgetBytes: number
  readonly syncMode: LibrarySyncMode
  readonly streamQuality: StreamQualitySettings
  readonly replayGainMode: ReplayGainMode
  readonly librarySort: LibrarySort
  readonly libraryFilter: LibraryFilter
  /**
   * Legacy preference — ignored for playback until AVAudioEngine queue ships.
   * Kept so older settings.json round-trips without noisy resets.
   */
  readonly gaplessPlayback: boolean
  /** Keep playing similar Instant Mix tracks when a queue ends — default on. */
  readonly autoplayEnabled: boolean
  /** Local overlap fade duration; 0 = off. */
  readonly crossfadeSeconds: CrossfadeSeconds
  /** Persisted for a future engine insert; UI removed until audible. */
  readonly eq: EqSettings
  readonly syncPacks: SyncPackIndex
}

const SETTINGS_FILE = 'settings.json'
const LEGACY_PACKS_FILE = 'sync-packs.json'

const defaultSettings = (): Settings => ({
  prefetchEnabled: true,
  budgetBytes: defaultBudgetBytes,
  syncMode: 'onOpen',
  streamQuality: defaultStreamQuality(),
  replayGainMode: 'off',
  librarySort: 'name',
  libraryFilter: 'all',
  gaplessPlayback: false,
  autoplayEnabled: true,
  crossfadeSeconds: 0,
  eq: defaultEqSettings(),
  syncPacks: emptySyncPackIndex(),
})

const persistSettings = async (settings: Settings) => {
  const { syncPacks: _packs, ...rest } = settings
  await writeJsonFile(SETTINGS_FILE, rest)
}

const snapshot = (
  state: Settings,
  patch: Partial<Settings> = {},
): Settings => ({
  prefetchEnabled: patch.prefetchEnabled ?? state.prefetchEnabled,
  budgetBytes: patch.budgetBytes ?? state.budgetBytes,
  syncMode: patch.syncMode ?? state.syncMode,
  streamQuality: patch.streamQuality ?? state.streamQuality,
  replayGainMode: patch.replayGainMode ?? state.replayGainMode,
  librarySort: patch.librarySort ?? state.librarySort,
  libraryFilter: patch.libraryFilter ?? state.libraryFilter,
  gaplessPlayback: patch.gaplessPlayback ?? state.gaplessPlayback,
  autoplayEnabled: patch.autoplayEnabled ?? state.autoplayEnabled,
  crossfadeSeconds: patch.crossfadeSeconds ?? state.crossfadeSeconds,
  eq: patch.eq ?? state.eq,
  syncPacks: patch.syncPacks ?? state.syncPacks,
})

const packsPathFor = (serverUrl: string, userId: string): string =>
  scopedPacksRelativePath(accountScopeKey({ serverUrl, userId }))

const loadPacksForScope = async (
  serverUrl: string,
  userId: string,
): Promise<SyncPackIndex> => {
  const scopedPath = packsPathFor(serverUrl, userId)
  const scoped = await readJsonFile<unknown>(scopedPath)
  if (scoped.ok && scoped.value) {
    return parseSyncPackIndex(scoped.value)
  }
  const legacy = await readJsonFile<unknown>(LEGACY_PACKS_FILE)
  if (legacy.ok && legacy.value) {
    const parsed = parseSyncPackIndex(legacy.value)
    await writeJsonFile(scopedPath, parsed)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useSessionStore } = require('@/src/store/session') as typeof import('@/src/store/session')
      if (useSessionStore.getState().accounts.accounts.length === 1) {
        await deleteFile(resolveOfflineFileUri(LEGACY_PACKS_FILE))
      }
    } catch {
      // Keep the legacy file so another account can still adopt it.
    }
    return parsed
  }
  return emptySyncPackIndex()
}

type SettingsState = Settings & {
  readonly offlineIndex: OfflineIndex
  readonly hydrated: boolean
  readonly activeScopeKey: string | null
  readonly hydrate: () => Promise<void>
  readonly activateAccountScope: (
    serverUrl: string,
    userId: string,
  ) => Promise<void>
  readonly setPrefetchEnabled: (enabled: boolean) => Promise<void>
  readonly setBudgetBytes: (bytes: number) => Promise<void>
  readonly setSyncMode: (syncMode: LibrarySyncMode) => Promise<void>
  readonly setStreamQuality: (patch: Partial<StreamQualitySettings>) => Promise<void>
  readonly setReplayGainMode: (mode: ReplayGainMode) => Promise<void>
  readonly setLibrarySort: (sort: LibrarySort) => Promise<void>
  readonly setLibraryFilter: (filter: LibraryFilter) => Promise<void>
  readonly setGaplessPlayback: (enabled: boolean) => Promise<void>
  readonly setAutoplayEnabled: (enabled: boolean) => Promise<void>
  readonly setCrossfadeSeconds: (seconds: CrossfadeSeconds) => Promise<void>
  readonly setEq: (patch: Partial<EqSettings>) => Promise<void>
  readonly setSyncPacks: (syncPacks: SyncPackIndex) => Promise<void>
  readonly setOfflineIndex: (index: OfflineIndex) => Promise<void>
  readonly clearOfflineCache: (
    scope?: { readonly serverUrl?: string; readonly userId?: string },
  ) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings(),
  offlineIndex: emptyOfflineIndex(),
  hydrated: false,
  activeScopeKey: null,
  hydrate: async () => {
    setOfflineIndexPublishHandler((index) => {
      set({ offlineIndex: index })
    })
    const settings = await readJsonFile<Partial<Settings>>(SETTINGS_FILE)
    const defaults = defaultSettings()
    const loaded = settings.ok && settings.value ? settings.value : {}
    set({
      ...defaults,
      ...loaded,
      syncMode:
        loaded.syncMode === 'onOpen' ||
        loaded.syncMode === 'wifiOnly' ||
        loaded.syncMode === 'manual'
          ? loaded.syncMode
          : defaults.syncMode,
      streamQuality: parseStreamQuality(loaded.streamQuality),
      replayGainMode: isReplayGainMode(loaded.replayGainMode)
        ? loaded.replayGainMode
        : defaults.replayGainMode,
      librarySort: isLibrarySort(loaded.librarySort)
        ? loaded.librarySort
        : defaults.librarySort,
      libraryFilter: isLibraryFilter(loaded.libraryFilter)
        ? loaded.libraryFilter
        : defaults.libraryFilter,
      gaplessPlayback:
        typeof loaded.gaplessPlayback === 'boolean'
          ? loaded.gaplessPlayback
          : defaults.gaplessPlayback,
      autoplayEnabled:
        typeof loaded.autoplayEnabled === 'boolean'
          ? loaded.autoplayEnabled
          : defaults.autoplayEnabled,
      crossfadeSeconds: normalizeCrossfadeSeconds(loaded.crossfadeSeconds),
      eq: parseEqSettings(loaded.eq),
      syncPacks: defaults.syncPacks,
      offlineIndex: emptyOfflineIndex(),
      hydrated: true,
    })
    // Session hydrate may race; activate when already signed in.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSessionStore } = require('@/src/store/session') as typeof import('@/src/store/session')
    const session = useSessionStore.getState().session
    if (session) {
      await get().activateAccountScope(session.serverUrl, session.userId)
    }
  },
  activateAccountScope: async (serverUrl, userId) => {
    const key = accountScopeKey({ serverUrl, userId })
    if (get().activeScopeKey === key && getMemoryOfflineIndex()) {
      const packs = await loadPacksForScope(serverUrl, userId)
      set({
        syncPacks: packs,
        activeScopeKey: key,
        offlineIndex: getMemoryOfflineIndex()!,
      })
      return
    }
    const stamped = await stampOfflineScope(serverUrl, userId)
    const packs = await loadPacksForScope(serverUrl, userId)
    set({
      offlineIndex: stamped.ok
        ? stamped.value
        : emptyOfflineIndex(get().budgetBytes, { serverUrl, userId }),
      syncPacks: packs,
      activeScopeKey: key,
    })
  },
  setPrefetchEnabled: async (prefetchEnabled) => {
    await persistSettings(snapshot(get(), { prefetchEnabled }))
    set({ prefetchEnabled })
  },
  setBudgetBytes: async (budgetBytes) => {
    await persistSettings(snapshot(get(), { budgetBytes }))
    const offlineIndex = { ...get().offlineIndex, budgetBytes }
    await persistOfflineIndex(offlineIndex)
    set({ budgetBytes, offlineIndex })
  },
  setSyncMode: async (syncMode) => {
    await persistSettings(snapshot(get(), { syncMode }))
    set({ syncMode })
  },
  setStreamQuality: async (patch) => {
    const streamQuality = parseStreamQuality({ ...get().streamQuality, ...patch })
    await persistSettings(snapshot(get(), { streamQuality }))
    set({ streamQuality })
  },
  setReplayGainMode: async (replayGainMode) => {
    await persistSettings(snapshot(get(), { replayGainMode }))
    set({ replayGainMode })
  },
  setLibrarySort: async (librarySort) => {
    await persistSettings(snapshot(get(), { librarySort }))
    set({ librarySort })
  },
  setLibraryFilter: async (libraryFilter) => {
    await persistSettings(snapshot(get(), { libraryFilter }))
    set({ libraryFilter })
  },
  setGaplessPlayback: async (gaplessPlayback) => {
    await persistSettings(snapshot(get(), { gaplessPlayback }))
    set({ gaplessPlayback })
  },
  setAutoplayEnabled: async (autoplayEnabled) => {
    await persistSettings(snapshot(get(), { autoplayEnabled }))
    set({ autoplayEnabled })
    // Keep Now Playing session toggle in sync with Settings.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { usePlayerStore } = require('@/src/store/player') as typeof import('@/src/store/player')
    const player = usePlayerStore.getState()
    if (player.autoplaySessionOn !== autoplayEnabled) {
      player.setAutoplaySessionOn(autoplayEnabled)
    }
  },
  setCrossfadeSeconds: async (crossfadeSeconds) => {
    const normalized = normalizeCrossfadeSeconds(crossfadeSeconds)
    await persistSettings(snapshot(get(), { crossfadeSeconds: normalized }))
    set({ crossfadeSeconds: normalized })
    if (normalized > 0) {
      void import('@/src/player/nativeQueue').then(({ primeNextIfEnabled }) => {
        void primeNextIfEnabled()
      })
    } else {
      void import('@/src/player/nativeQueue').then(({ clearNativeNextQueue }) => {
        clearNativeNextQueue()
      })
    }
  },
  setEq: async (patch) => {
    const eq = parseEqSettings({ ...get().eq, ...patch })
    await persistSettings(snapshot(get(), { eq }))
    set({ eq })
  },
  setSyncPacks: async (syncPacks) => {
    const key = get().activeScopeKey
    if (key) {
      await writeJsonFile(scopedPacksRelativePath(key), syncPacks)
    }
    set({ syncPacks })
  },
  setOfflineIndex: async (offlineIndex) => {
    if (getMemoryOfflineIndex() !== offlineIndex) {
      await persistOfflineIndex(offlineIndex)
    }
    set({ offlineIndex })
  },
  clearOfflineCache: async (scope) => {
    const result = await clearOfflineCache(get().budgetBytes, scope)
    if (result.ok) set({ offlineIndex: result.value })
  },
}))

export type { QualityPreset, StreamQualitySettings, EqSettings, CrossfadeSeconds }
