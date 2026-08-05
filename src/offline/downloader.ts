import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import {
  applyEvictions,
  emptyOfflineIndex,
  selectPrefetchEvictions,
  upsertEntry,
  type OfflineEntry,
  type OfflineIndex,
} from '@/src/domain/offline'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { QueueTrack } from '@/src/domain/queue'
import { logger } from '@/src/logging/logger'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { buildUniversalStreamUrl } from '@/src/services/jellyfin/library'
import {
  audioFilePath,
  deleteFile,
  ensureDir,
  readJsonFile,
  writeJsonFile,
} from '@/src/storage/jsonFile'

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
    .catch((cause) => err(appError('storage', 'Unable to persist offline index', cause)))

export const downloadTrack = async (
  context: JellyfinContext,
  userId: string,
  track: QueueTrack,
  kind: OfflineEntry['kind'],
): Promise<Result<OfflineIndex>> => {
  // Native File/Directory APIs throw on web (validatePath). Stream only.
  if (Platform.OS === 'web') return loadOfflineIndex()

  const indexResult = await loadOfflineIndex()
  if (!indexResult.ok) return indexResult
  const existing = indexResult.value.entries[track.id]
  if (existing?.complete) {
    return ok(
      upsertEntry(indexResult.value, {
        ...existing,
        lastAccessedAt: Date.now(),
        kind: kind === 'user' ? 'user' : existing.kind,
      }),
    )
  }

  const dir = await ensureDir('audio')
  if (!dir.ok) return dir

  const destination = new File(Paths.document, 'melio', 'audio', track.id)
  const remote = buildUniversalStreamUrl(context, track.id, userId)

  try {
    const downloaded = await File.downloadFileAsync(remote, destination, {
      headers: context.accessToken
        ? { 'X-Emby-Token': context.accessToken }
        : undefined,
      idempotent: true,
    })
    const sizeBytes = downloaded.size ?? 0
    const evictionIds = selectPrefetchEvictions(indexResult.value, sizeBytes)
    await Promise.all(
      evictionIds.map(async (id) => {
        const path = indexResult.value.entries[id]?.path ?? audioFilePath(id)
        await deleteFile(path)
      }),
    )
    const entry: OfflineEntry = {
      itemId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationMs: track.durationMs,
      path: downloaded.uri,
      sizeBytes,
      artworkPath: track.artworkUrl,
      downloadedAt: Date.now(),
      lastAccessedAt: Date.now(),
      kind,
      complete: true,
    }
    const next = upsertEntry(applyEvictions(indexResult.value, evictionIds), entry)
    const persist = await persistOfflineIndex(next)
    if (!persist.ok) return persist
    return ok(next)
  } catch (cause) {
    logger.error('Track download failed', { itemId: track.id, cause })
    return err(appError('network', 'Track download failed', cause))
  }
}
