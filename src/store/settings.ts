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
  defaultStreamQuality,
  parseStreamQuality,
  type QualityPreset,
  type StreamQualitySettings,
} from '@/src/domain/streamQuality'
import {
  clearOfflineCache,
  getMemoryOfflineIndex,
  loadOfflineIndex,
  persistOfflineIndex,
  setOfflineIndexPublishHandler,
} from '@/src/offline/downloader'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

type Settings = {
  readonly prefetchEnabled: boolean
  readonly budgetBytes: number
  readonly syncMode: LibrarySyncMode
  readonly streamQuality: StreamQualitySettings
  readonly replayGainMode: ReplayGainMode
  readonly librarySort: LibrarySort
  readonly libraryFilter: LibraryFilter
}

const SETTINGS_FILE = 'settings.json'

const defaultSettings = (): Settings => ({
  prefetchEnabled: true,
  budgetBytes: defaultBudgetBytes,
  syncMode: 'onOpen',
  streamQuality: defaultStreamQuality(),
  replayGainMode: 'off',
  librarySort: 'name',
  libraryFilter: 'all',
})

const persistSettings = async (settings: Settings) => {
  await writeJsonFile(SETTINGS_FILE, settings)
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
})

type SettingsState = Settings & {
  readonly offlineIndex: OfflineIndex
  readonly hydrated: boolean
  readonly hydrate: () => Promise<void>
  readonly setPrefetchEnabled: (enabled: boolean) => Promise<void>
  readonly setBudgetBytes: (bytes: number) => Promise<void>
  readonly setSyncMode: (syncMode: LibrarySyncMode) => Promise<void>
  readonly setStreamQuality: (patch: Partial<StreamQualitySettings>) => Promise<void>
  readonly setReplayGainMode: (mode: ReplayGainMode) => Promise<void>
  readonly setLibrarySort: (sort: LibrarySort) => Promise<void>
  readonly setLibraryFilter: (filter: LibraryFilter) => Promise<void>
  readonly setOfflineIndex: (index: OfflineIndex) => Promise<void>
  readonly clearOfflineCache: (
    scope?: { readonly serverUrl?: string; readonly userId?: string },
  ) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings(),
  offlineIndex: emptyOfflineIndex(),
  hydrated: false,
  hydrate: async () => {
    setOfflineIndexPublishHandler((index) => {
      set({ offlineIndex: index })
    })
    const settings = await readJsonFile<Partial<Settings>>(SETTINGS_FILE)
    const offline = await loadOfflineIndex()
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
      offlineIndex: offline.ok ? offline.value : emptyOfflineIndex(),
      hydrated: true,
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

export type { QualityPreset, StreamQualitySettings }
