import { create } from 'zustand'
import type { LibraryItem } from '@/src/domain/libraryItem'
import { accountScopeKey } from '@/src/domain/accountScope'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

/** Client-built Home Instant Mix, not a Jellyfin playlist id. */
export type CachedHomeMix = {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly tracks: readonly LibraryItem[]
  readonly icon: string
}

type PersistedHomeMixes = {
  readonly mixes: readonly CachedHomeMix[]
  readonly savedAt?: number
}

export type LoadedHomeMixes = {
  readonly mixes: readonly CachedHomeMix[]
  readonly savedAt: number | undefined
}

const mixesPath = (serverUrl: string, userId: string): string =>
  `home-mixes-${accountScopeKey({ serverUrl, userId })}.json`

const isCachedMix = (value: unknown): value is CachedHomeMix => {
  if (!value || typeof value !== 'object') return false
  const mix = value as CachedHomeMix
  return (
    typeof mix.id === 'string' &&
    mix.id.length > 0 &&
    typeof mix.title === 'string' &&
    typeof mix.subtitle === 'string' &&
    typeof mix.icon === 'string' &&
    Array.isArray(mix.tracks)
  )
}

export const loadPersistedHomeMixes = async (
  serverUrl: string,
  userId: string,
): Promise<LoadedHomeMixes> => {
  const result = await readJsonFile<PersistedHomeMixes>(mixesPath(serverUrl, userId))
  if (!result.ok || !result.value?.mixes) return { mixes: [], savedAt: undefined }
  const savedAt = result.value.savedAt
  return {
    mixes: result.value.mixes.filter(isCachedMix),
    savedAt:
      typeof savedAt === 'number' && Number.isFinite(savedAt) && savedAt > 0
        ? savedAt
        : undefined,
  }
}

export const persistHomeMixes = async (
  serverUrl: string,
  userId: string,
  mixes: readonly CachedHomeMix[],
  savedAt = Date.now(),
): Promise<void> => {
  await writeJsonFile(mixesPath(serverUrl, userId), { mixes, savedAt })
}

type HomeMixesStore = {
  readonly byId: Readonly<Record<string, CachedHomeMix>>
  readonly setMixes: (mixes: readonly CachedHomeMix[]) => void
  /** Merge one mix. Leave siblings intact so an open detail stays valid. */
  readonly upsertMix: (mix: CachedHomeMix) => void
  readonly clear: () => void
}

export const useHomeMixesStore = create<HomeMixesStore>((set) => ({
  byId: {},
  setMixes: (mixes) =>
    set({
      byId: Object.fromEntries(mixes.map((mix) => [mix.id, mix])),
    }),
  upsertMix: (mix) =>
    set((state) => ({
      byId: { ...state.byId, [mix.id]: mix },
    })),
  clear: () => set({ byId: {} }),
}))
