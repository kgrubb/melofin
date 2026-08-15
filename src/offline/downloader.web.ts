import {
  emptyOfflineIndex,
  removeEntry,
  type OfflineEntry,
  type OfflineIndex,
} from '@/src/domain/offline'
import { ok, type Result } from '@/src/domain/result'
import type { QueueTrack } from '@/src/domain/queue'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

const INDEX_FILE = 'offline-index.json'

const createWriteQueue = () => {
  const chainRef = { current: Promise.resolve() as Promise<void> }
  return (task: () => Promise<void>): Promise<void> => {
    const next = chainRef.current.then(task, task)
    chainRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}

const enqueueWrite = createWriteQueue()
const state = {
  memoryIndex: null as OfflineIndex | null,
}

export const getMemoryOfflineIndex = (): OfflineIndex | null => state.memoryIndex

export const setOfflineIndexPublishHandler = (
  _handler: ((index: OfflineIndex) => void) | null,
): void => undefined

export const loadOfflineIndex = async (scope?: {
  readonly serverUrl?: string
  readonly userId?: string
}): Promise<Result<OfflineIndex>> => {
  if (state.memoryIndex) {
    if (scope?.serverUrl || scope?.userId) {
      return ok({
        ...state.memoryIndex,
        serverUrl: scope.serverUrl ?? state.memoryIndex.serverUrl,
        userId: scope.userId ?? state.memoryIndex.userId,
      })
    }
    return ok(state.memoryIndex)
  }
  const result = await readJsonFile<OfflineIndex>(INDEX_FILE)
  if (!result.ok) return result
  state.memoryIndex = result.value ?? emptyOfflineIndex(undefined, scope)
  return ok(state.memoryIndex)
}

export const persistOfflineIndex = async (
  index: OfflineIndex,
): Promise<Result<void>> => {
  state.memoryIndex = index
  return enqueueWrite(async () => {
    const result = await writeJsonFile(INDEX_FILE, index)
    if (!result.ok) throw result.error
  })
    .then(() => ok(undefined))
    .catch(() => ok(undefined))
}

export const clearOfflineCache = async (
  budgetBytes?: number,
  scope?: { readonly serverUrl?: string; readonly userId?: string },
): Promise<Result<OfflineIndex>> => {
  state.memoryIndex = emptyOfflineIndex(budgetBytes, scope)
  await persistOfflineIndex(state.memoryIndex)
  return ok(state.memoryIndex)
}

export const stampOfflineScope = async (
  serverUrl: string,
  userId: string,
): Promise<Result<OfflineIndex>> => {
  const loaded = await loadOfflineIndex({ serverUrl, userId })
  if (!loaded.ok) return loaded
  const next = { ...loaded.value, serverUrl, userId }
  await persistOfflineIndex(next)
  return ok(next)
}

/** Offline file downloads are native-only. Web streams remotely. */
export const pauseOfflineDownloads = (): void => undefined
export const resumeOfflineDownloads = (): void => undefined

export const downloadTrack = async (
  _context: JellyfinContext,
  _userId: string,
  _track: QueueTrack,
  _kind: OfflineEntry['kind'],
): Promise<Result<OfflineIndex>> => loadOfflineIndex()

export const downloadTracks = async (
  _context: JellyfinContext,
  _userId: string,
  _tracks: readonly QueueTrack[],
  _kind: OfflineEntry['kind'],
): Promise<Result<OfflineIndex>> => loadOfflineIndex()

export const removeDownloadedTrack = async (
  itemId: string,
): Promise<Result<OfflineIndex>> => {
  const loaded = await loadOfflineIndex()
  if (!loaded.ok) return loaded
  const next = removeEntry(loaded.value, itemId)
  await persistOfflineIndex(next)
  return ok(next)
}
