import {
  emptyOfflineIndex,
  type OfflineEntry,
  type OfflineIndex,
} from '@/src/domain/offline'
import { ok, type Result } from '@/src/domain/result'
import type { QueueTrack } from '@/src/domain/queue'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

const INDEX_FILE = 'offline-index.json'

type WriteTask = () => Promise<void>

const createWriteQueue = () => {
  const chainRef = { current: Promise.resolve() as Promise<void> }
  return (task: WriteTask): Promise<void> => {
    const next = chainRef.current.then(task, task)
    chainRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}

const enqueueWrite = createWriteQueue()

export const loadOfflineIndex = async (): Promise<Result<OfflineIndex>> => {
  const result = await readJsonFile<OfflineIndex>(INDEX_FILE)
  if (!result.ok) return result
  return ok(result.value ?? emptyOfflineIndex())
}

export const persistOfflineIndex = async (
  index: OfflineIndex,
): Promise<Result<void>> =>
  enqueueWrite(async () => {
    const result = await writeJsonFile(INDEX_FILE, index)
    if (!result.ok) throw result.error
  })
    .then(() => ok(undefined))
    .catch(() => ok(undefined))

/** Offline file downloads are native-only. Web streams remotely. */
export const downloadTrack = async (
  _context: JellyfinContext,
  _userId: string,
  _track: QueueTrack,
  _kind: OfflineEntry['kind'],
): Promise<Result<OfflineIndex>> => loadOfflineIndex()
