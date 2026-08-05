import { create } from 'zustand'
import {
  defaultBudgetBytes,
  emptyOfflineIndex,
  type OfflineIndex,
} from '@/src/domain/offline'
import {
  type LibrarySyncMode,
} from '@/src/domain/librarySync'
import { loadOfflineIndex, persistOfflineIndex } from '@/src/offline/downloader'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

type Settings = {
  readonly prefetchEnabled: boolean
  readonly budgetBytes: number
  readonly syncMode: LibrarySyncMode
}

const SETTINGS_FILE = 'settings.json'

const defaultSettings = (): Settings => ({
  prefetchEnabled: true,
  budgetBytes: defaultBudgetBytes,
  syncMode: 'onOpen',
})

const persistSettings = async (settings: Settings) => {
  await writeJsonFile(SETTINGS_FILE, {
    prefetchEnabled: settings.prefetchEnabled,
    budgetBytes: settings.budgetBytes,
    syncMode: settings.syncMode,
  })
}

type SettingsState = Settings & {
  readonly offlineIndex: OfflineIndex
  readonly hydrated: boolean
  readonly hydrate: () => Promise<void>
  readonly setPrefetchEnabled: (enabled: boolean) => Promise<void>
  readonly setBudgetBytes: (bytes: number) => Promise<void>
  readonly setSyncMode: (syncMode: LibrarySyncMode) => Promise<void>
  readonly setOfflineIndex: (index: OfflineIndex) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings(),
  offlineIndex: emptyOfflineIndex(),
  hydrated: false,
  hydrate: async () => {
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
      offlineIndex: offline.ok ? offline.value : emptyOfflineIndex(),
      hydrated: true,
    })
  },
  setPrefetchEnabled: async (prefetchEnabled) => {
    const next = {
      prefetchEnabled,
      budgetBytes: get().budgetBytes,
      syncMode: get().syncMode,
    }
    await persistSettings(next)
    set({ prefetchEnabled })
  },
  setBudgetBytes: async (budgetBytes) => {
    const next = {
      prefetchEnabled: get().prefetchEnabled,
      budgetBytes,
      syncMode: get().syncMode,
    }
    await persistSettings(next)
    const offlineIndex = { ...get().offlineIndex, budgetBytes }
    await persistOfflineIndex(offlineIndex)
    set({ budgetBytes, offlineIndex })
  },
  setSyncMode: async (syncMode) => {
    const next = {
      prefetchEnabled: get().prefetchEnabled,
      budgetBytes: get().budgetBytes,
      syncMode,
    }
    await persistSettings(next)
    set({ syncMode })
  },
  setOfflineIndex: async (offlineIndex) => {
    await persistOfflineIndex(offlineIndex)
    set({ offlineIndex })
  },
}))
