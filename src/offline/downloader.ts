import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import {
  applyEvictions,
  emptyOfflineIndex,
  indexMatchesServer,
  offlineRelativePath,
  removeEntry,
  selectPrefetchEvictions,
  upsertEntry,
  type OfflineEntry,
  type OfflineIndex,
} from '@/src/domain/offline'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { QueueTrack } from '@/src/domain/queue'
import { logger } from '@/src/logging/logger'
import { createDownloadScheduler } from '@/src/offline/downloadScheduler'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { buildAudioStreamUrl, fetchLyrics } from '@/src/services/jellyfin/library'
import {
  offlineLyricsRelativePath,
} from '@/src/domain/lyrics'
import { bitrateForPreset } from '@/src/domain/streamQuality'
import {
  audioFilePath,
  deleteAudioCacheDir,
  deleteFile,
  ensureDir,
  readJsonFile,
  resolveOfflineFileUri,
  writeJsonFile,
} from '@/src/storage/jsonFile'

const INDEX_FILE = 'offline-index.json'
const DOWNLOAD_CONCURRENCY = 2

/** Lazy — avoids settings ↔ downloader require cycle. */
const downloadPreset = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSettingsStore } = require('@/src/store/settings') as typeof import('@/src/store/settings')
  return useSettingsStore.getState().streamQuality.download
}

const createWriteQueue = () => {
  const chainRef = { current: Promise.resolve() as Promise<void> }
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = chainRef.current.then(task, task)
    chainRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}

const enqueueWrite = createWriteQueue()
const downloadScheduler = createDownloadScheduler(DOWNLOAD_CONCURRENCY)

export const pauseOfflineDownloads = (): void => {
  downloadScheduler.pause()
}

export const resumeOfflineDownloads = (): void => {
  downloadScheduler.resume()
}

const state = {
  memoryIndex: null as OfflineIndex | null,
  hydratePromise: null as Promise<Result<OfflineIndex>> | null,
  uiPublishTimer: null as ReturnType<typeof setTimeout> | null,
  uiPublishHandler: null as ((index: OfflineIndex) => void) | null,
}

export const getMemoryOfflineIndex = (): OfflineIndex | null => state.memoryIndex

/** Settings/UI can register to receive coalesced index publishes after prefetch. */
export const setOfflineIndexPublishHandler = (
  handler: ((index: OfflineIndex) => void) | null,
): void => {
  state.uiPublishHandler = handler
}

const scheduleUiPublish = (index: OfflineIndex) => {
  if (!state.uiPublishHandler) return
  if (state.uiPublishTimer) clearTimeout(state.uiPublishTimer)
  state.uiPublishTimer = setTimeout(() => {
    state.uiPublishTimer = null
    state.uiPublishHandler?.(index)
  }, 120)
}

/** Serialize index mutations so concurrent downloads cannot clobber entries. */
const commitIndex = (
  mutate: (index: OfflineIndex) => OfflineIndex | Promise<OfflineIndex>,
  opts?: { readonly publishUi?: boolean },
): Promise<Result<OfflineIndex>> =>
  enqueueWrite(async () => {
    const base = state.memoryIndex ?? emptyOfflineIndex()
    const next = await mutate(base)
    state.memoryIndex = next
    const written = await writeJsonFile(INDEX_FILE, next)
    if (!written.ok) throw written.error
    if (opts?.publishUi !== false) scheduleUiPublish(next)
    return next
  })
    .then((next) => ok(next))
    .catch((cause) => err(appError('storage', 'Unable to persist offline index', cause)))

export const persistOfflineIndex = async (
  index: OfflineIndex,
): Promise<Result<void>> => {
  const result = await commitIndex(() => index)
  return result.ok ? ok(undefined) : result
}

const purgeOrphanFiles = async (index: OfflineIndex) => {
  await Promise.all(
    Object.values(index.entries).map(async (entry) => {
      await deleteFile(resolveOfflineFileUri(entry.path))
    }),
  )
  await deleteAudioCacheDir()
}

const readStoredIndex = async (): Promise<Result<OfflineIndex | null>> => {
  const result = await readJsonFile<OfflineIndex>(INDEX_FILE)
  if (!result.ok) return result
  return ok(result.value)
}

export const loadOfflineIndex = async (scope?: {
  readonly serverUrl?: string
  readonly userId?: string
}): Promise<Result<OfflineIndex>> => {
  if (state.memoryIndex) {
    if (
      scope?.serverUrl &&
      !indexMatchesServer(state.memoryIndex, scope.serverUrl, scope.userId)
    ) {
      const budget = state.memoryIndex.budgetBytes
      await clearOfflineCache(budget, scope)
      return ok(state.memoryIndex ?? emptyOfflineIndex(budget, scope))
    }
    return ok(state.memoryIndex)
  }
  if (state.hydratePromise) return state.hydratePromise

  state.hydratePromise = (async () => {
    const stored = await readStoredIndex()
    if (!stored.ok) {
      state.hydratePromise = null
      return stored
    }
    const index = stored.value
    if (!index) {
      const empty = emptyOfflineIndex(undefined, scope)
      state.memoryIndex = empty
      return ok(empty)
    }
    if (
      scope?.serverUrl &&
      !indexMatchesServer(index, scope.serverUrl, scope.userId)
    ) {
      state.memoryIndex = index
      return clearOfflineCache(index.budgetBytes, scope)
    }
    state.memoryIndex = index
    return ok(index)
  })()

  const hydrated = await state.hydratePromise
  if (!hydrated.ok) state.hydratePromise = null
  return hydrated
}

export const clearOfflineCache = async (
  budgetBytes?: number,
  scope?: { readonly serverUrl?: string; readonly userId?: string },
): Promise<Result<OfflineIndex>> => {
  const current = state.memoryIndex ?? emptyOfflineIndex(budgetBytes)
  await purgeOrphanFiles(current)
  state.hydratePromise = null
  return commitIndex(
    () => emptyOfflineIndex(budgetBytes ?? current.budgetBytes, scope),
    { publishUi: true },
  )
}

export const stampOfflineScope = async (
  serverUrl: string,
  userId: string,
): Promise<Result<OfflineIndex>> => {
  const loaded = await loadOfflineIndex({ serverUrl, userId })
  if (!loaded.ok) return loaded
  if (
    loaded.value.serverUrl === serverUrl &&
    loaded.value.userId === userId
  ) {
    return loaded
  }
  return commitIndex((index) => ({
    ...index,
    serverUrl,
    userId,
  }))
}

const downloadTrackUnlocked = async (
  context: JellyfinContext,
  userId: string,
  track: QueueTrack,
  kind: OfflineEntry['kind'],
): Promise<Result<OfflineIndex>> => {
  const indexResult = await loadOfflineIndex({
    serverUrl: context.serverUrl,
    userId,
  })
  if (!indexResult.ok) return indexResult
  const existing = indexResult.value.entries[track.id]
  if (existing?.complete) {
    return commitIndex((index) => {
      const entry = index.entries[track.id]
      if (!entry?.complete) return index
      return {
        ...upsertEntry(index, {
          ...entry,
          lastAccessedAt: Date.now(),
          kind: kind === 'user' ? 'user' : entry.kind,
        }),
        serverUrl: context.serverUrl,
        userId,
      }
    })
  }

  const dir = await ensureDir('audio')
  if (!dir.ok) return dir

  const destination = new File(Paths.document, 'melio', 'audio', track.id)
  const remote = buildAudioStreamUrl(
    context,
    track.id,
    userId,
    bitrateForPreset(downloadPreset()),
  )

  try {
    const lyricsDirPromise = ensureDir('lyrics')
    const lyricsPromise = fetchLyrics(context, track.id)
    const downloaded = await File.downloadFileAsync(remote, destination, {
      headers: context.accessToken
        ? { 'X-Emby-Token': context.accessToken }
        : undefined,
      idempotent: true,
    })
    const sizeBytes = downloaded.size ?? 0
    const relative = offlineRelativePath(track.id)
    let lyricsPath: string | undefined
    const [lyricsDir, lyricsResult] = await Promise.all([lyricsDirPromise, lyricsPromise])
    if (
      lyricsDir.ok &&
      lyricsResult.ok &&
      lyricsResult.value.lines.length > 0
    ) {
      const relativeLyrics = offlineLyricsRelativePath(track.id)
      const written = await writeJsonFile(relativeLyrics, lyricsResult.value)
      if (written.ok) lyricsPath = relativeLyrics
    }
    return commitIndex(async (latest) => {
      const evictionIds = selectPrefetchEvictions(latest, sizeBytes)
      await Promise.all(
        evictionIds.map(async (id) => {
          const path = latest.entries[id]?.path ?? audioFilePath(id)
          await deleteFile(resolveOfflineFileUri(path))
          const lyrics = latest.entries[id]?.lyricsPath
          if (lyrics) await deleteFile(resolveOfflineFileUri(lyrics))
        }),
      )
      return {
        ...upsertEntry(applyEvictions(latest, evictionIds), {
          itemId: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          durationMs: track.durationMs,
          path: relative,
          sizeBytes,
          artworkPath: track.artworkUrl,
          lyricsPath,
          downloadedAt: Date.now(),
          lastAccessedAt: Date.now(),
          kind,
          complete: true,
        }),
        serverUrl: context.serverUrl,
        userId,
      }
    })
  } catch (cause) {
    logger.error('Track download failed', { itemId: track.id, cause })
    return err(appError('network', 'Track download failed', cause))
  }
}

export const downloadTrack = async (
  context: JellyfinContext,
  userId: string,
  track: QueueTrack,
  kind: OfflineEntry['kind'],
): Promise<Result<OfflineIndex>> => {
  if (Platform.OS === 'web') return loadOfflineIndex()
  return downloadScheduler.enqueue(() =>
    downloadTrackUnlocked(context, userId, track, kind),
  )
}

export const removeDownloadedTrack = async (
  itemId: string,
): Promise<Result<OfflineIndex>> => {
  if (Platform.OS === 'web') return loadOfflineIndex()
  return commitIndex(
    async (index) => {
      const entry = index.entries[itemId]
      if (!entry) return index
      await deleteFile(resolveOfflineFileUri(entry.path))
      if (entry.artworkPath?.startsWith('file://') || entry.artworkPath?.startsWith('/')) {
        await deleteFile(resolveOfflineFileUri(entry.artworkPath))
      }
      if (entry.lyricsPath) {
        await deleteFile(resolveOfflineFileUri(entry.lyricsPath))
      }
      return removeEntry(index, itemId)
    },
    { publishUi: true },
  )
}

export const downloadTracks = async (
  context: JellyfinContext,
  userId: string,
  tracks: readonly QueueTrack[],
  kind: OfflineEntry['kind'],
): Promise<Result<OfflineIndex>> => {
  if (Platform.OS === 'web' || tracks.length === 0) return loadOfflineIndex()
  const results = await Promise.all(
    tracks.map((track) => downloadTrack(context, userId, track, kind)),
  )
  const failed = results.find((result) => !result.ok)
  if (failed && !failed.ok) return failed
  return loadOfflineIndex()
}
