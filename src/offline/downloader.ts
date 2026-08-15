import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import {
  applyEvictions,
  emptyOfflineIndex,
  indexMatchesServer,
  removeEntry,
  totalSizeBytes,
  upsertEntry,
  type OfflineEntry,
  type OfflineIndex,
} from '@/src/domain/offline'
import { accountScopeKey, scopedAudioRelativePath, scopedLyricsRelativePath, scopedOfflineIndexRelativePath } from '@/src/domain/accountScope'
import { audioExtensionFromHeader } from '@/src/domain/audioFormat'
import { planLegacyOfflineMigration } from '@/src/domain/offlineMigration'
import {
  packTrackIdSet,
  selectPrefetchEvictionsExcludingPacks,
} from '@/src/domain/syncPack'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { QueueTrack } from '@/src/domain/queue'
import { logger } from '@/src/logging/logger'
import { createDownloadScheduler } from '@/src/offline/downloadScheduler'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { buildPlaybackStreamCandidates, fetchLyrics } from '@/src/services/jellyfin/library'
import { bitrateForPreset } from '@/src/domain/streamQuality'
import {
  audioFilePath,
  deleteAudioCacheDir,
  deleteFile,
  deleteRelativeDir,
  ensureDir,
  readJsonFile,
  resolveOfflineFileUri,
  writeJsonFile,
} from '@/src/storage/jsonFile'

const LEGACY_INDEX_FILE = 'offline-index.json'
const DOWNLOAD_CONCURRENCY = 2
const MIN_AUDIO_DOWNLOAD_BYTES = 2_048

const sniffAudioExtension = (
  file: Awaited<ReturnType<typeof File.downloadFileAsync>>,
): string | null => {
  try {
    const handle = file.open()
    try {
      const header = handle.readBytes(16)
      return audioExtensionFromHeader(header)
    } finally {
      handle.close()
    }
  } catch {
    return null
  }
}

/** Lazy load to avoid settings <-> downloader require cycle. */
const downloadPreset = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSettingsStore } = require('@/src/store/settings') as typeof import('@/src/store/settings')
  return useSettingsStore.getState().streamQuality.download
}

const protectedPackIds = (): ReadonlySet<string> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettingsStore } = require('@/src/store/settings') as typeof import('@/src/store/settings')
    return packTrackIdSet(useSettingsStore.getState().syncPacks)
  } catch {
    return new Set()
  }
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
  activeScopeKey: null as string | null,
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
  opts?: { readonly publishUi?: boolean; readonly scopeKey?: string | null },
): Promise<Result<OfflineIndex>> =>
  enqueueWrite(async () => {
    const scopeKey =
      opts?.scopeKey === undefined ? state.activeScopeKey : opts.scopeKey
    const isActive = scopeKey === state.activeScopeKey
    const file =
      scopeKey != null
        ? scopedOfflineIndexRelativePath(scopeKey)
        : LEGACY_INDEX_FILE
    const stored = isActive
      ? null
      : await readJsonFile<OfflineIndex>(file)
    if (stored && !stored.ok) throw stored.error
    const base = isActive
      ? state.memoryIndex ?? emptyOfflineIndex()
      : stored!.value ?? emptyOfflineIndex()
    const next = await mutate(base)
    const written = await writeJsonFile(file, next)
    if (!written.ok) throw written.error
    if (isActive) {
      state.memoryIndex = next
      if (opts?.publishUi !== false) scheduleUiPublish(next)
    }
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

const purgeIndexFiles = async (index: OfflineIndex) => {
  await Promise.all(
    Object.values(index.entries).map(async (entry) => {
      await deleteFile(resolveOfflineFileUri(entry.path))
      if (entry.lyricsPath) {
        await deleteFile(resolveOfflineFileUri(entry.lyricsPath))
      }
    }),
  )
}

const readIndexFile = async (
  relativePath: string,
): Promise<Result<OfflineIndex | null>> => {
  const result = await readJsonFile<OfflineIndex>(relativePath)
  if (!result.ok) return result
  return ok(result.value)
}

const peekOfflineIndex = async (
  serverUrl: string,
  userId: string,
): Promise<Result<OfflineIndex>> => {
  const key = accountScopeKey({ serverUrl, userId })
  if (state.activeScopeKey === key && state.memoryIndex) {
    return ok(state.memoryIndex)
  }
  const scoped = await readIndexFile(scopedOfflineIndexRelativePath(key))
  if (!scoped.ok) return scoped
  return ok(scoped.value ?? emptyOfflineIndex(undefined, { serverUrl, userId }))
}

const scopeFromIds = (scope?: {
  readonly serverUrl?: string
  readonly userId?: string
}): { readonly serverUrl: string; readonly userId: string } | null => {
  if (!scope?.serverUrl || !scope.userId) return null
  return { serverUrl: scope.serverUrl, userId: scope.userId }
}

/**
 * Load the offline index for an account scope. Switching accounts swaps the
 * in-memory index. It does not delete the previous account's files.
 */
export const loadOfflineIndex = async (scope?: {
  readonly serverUrl?: string
  readonly userId?: string
}): Promise<Result<OfflineIndex>> => {
  const ids = scopeFromIds(scope)
  if (ids) {
    const key = accountScopeKey(ids)
    if (state.memoryIndex && state.activeScopeKey === key) {
      return ok(state.memoryIndex)
    }
    // Drop in-memory pointer only. Prior scope already persisted on commit.
    state.memoryIndex = null
    state.activeScopeKey = key
    state.hydratePromise = null
  } else if (state.memoryIndex) {
    return ok(state.memoryIndex)
  }

  if (state.hydratePromise) return state.hydratePromise

  const targetKey = state.activeScopeKey
  const expectedKey = targetKey
  state.hydratePromise = (async () => {
    if (targetKey) {
      const scopedPath = scopedOfflineIndexRelativePath(targetKey)
      const scoped = await readIndexFile(scopedPath)
      if (!scoped.ok) {
        state.hydratePromise = null
        return scoped
      }
      if (state.activeScopeKey !== expectedKey) {
        return ok(state.memoryIndex ?? emptyOfflineIndex(undefined, ids ?? undefined))
      }
      if (scoped.value) {
        state.memoryIndex = scoped.value
        state.activeScopeKey = targetKey
        return ok(scoped.value)
      }

      // First activation: adopt legacy root index when it matches this account.
      const legacy = await readIndexFile(LEGACY_INDEX_FILE)
      if (!legacy.ok) {
        state.hydratePromise = null
        return legacy
      }
      if (state.activeScopeKey !== expectedKey) {
        return ok(state.memoryIndex ?? emptyOfflineIndex(undefined, ids ?? undefined))
      }
      if (
        legacy.value &&
        ids &&
        indexMatchesServer(legacy.value, ids.serverUrl, ids.userId)
      ) {
        state.memoryIndex = legacy.value
        state.activeScopeKey = targetKey
        const written = await writeJsonFile(scopedPath, legacy.value)
        if (written.ok) {
          await deleteFile(resolveOfflineFileUri(LEGACY_INDEX_FILE))
        }
        return ok(legacy.value)
      }

      const empty = emptyOfflineIndex(undefined, ids ?? undefined)
      state.memoryIndex = empty
      state.activeScopeKey = targetKey
      return ok(empty)
    }

    const legacy = await readIndexFile(LEGACY_INDEX_FILE)
    if (!legacy.ok) {
      state.hydratePromise = null
      return legacy
    }
    const index = legacy.value ?? emptyOfflineIndex()
    if (state.activeScopeKey !== expectedKey) {
      return ok(state.memoryIndex ?? index)
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
  const ids = scopeFromIds(scope)
  if (ids) {
    const loaded = await loadOfflineIndex(ids)
    if (!loaded.ok) return loaded
  }
  const current = state.memoryIndex ?? emptyOfflineIndex(budgetBytes, ids ?? undefined)
  await purgeIndexFiles(current)
  if (state.activeScopeKey) {
    await deleteRelativeDir(`scopes/${state.activeScopeKey}/audio`)
    await deleteRelativeDir(`scopes/${state.activeScopeKey}/lyrics`)
  } else {
    await deleteAudioCacheDir()
  }
  state.hydratePromise = null
  return commitIndex(
    () => emptyOfflineIndex(budgetBytes ?? current.budgetBytes, ids ?? scope),
    { publishUi: true },
  )
}

export const stampOfflineScope = async (
  serverUrl: string,
  userId: string,
): Promise<Result<OfflineIndex>> => {
  const loaded = await loadOfflineIndex({ serverUrl, userId })
  if (!loaded.ok) return loaded
  const plan = planLegacyOfflineMigration({
    index: loaded.value,
    scope: { serverUrl, userId },
  })
  if (plan.shouldMigrate) {
    const scopeKey = accountScopeKey({ serverUrl, userId })
    for (const move of plan.moves) {
      try {
        const fromUri = resolveOfflineFileUri(move.fromPath)
        await ensureDir(`scopes/${scopeKey}/audio`)
        const dest = new File(
          Paths.document,
          'melio',
          'scopes',
          scopeKey,
          'audio',
          move.itemId,
        )
        const src = new File(fromUri)
        if (src.exists && !dest.exists) {
          src.move(dest)
        }
      } catch (cause) {
        logger.warn('offline.legacy_move_failed', {
          itemId: move.itemId,
          cause: String(cause),
        })
      }
    }
    return commitIndex(() => plan.nextIndex)
  }
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
  const scopeKey = accountScopeKey({
    serverUrl: context.serverUrl,
    userId,
  })
  const indexResult = await peekOfflineIndex(context.serverUrl, userId)
  if (!indexResult.ok) return indexResult
  const existing = indexResult.value.entries[track.id]
  if (existing?.complete) {
    return commitIndex(
      (index) => {
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
      },
      { scopeKey },
    )
  }
  const dir = await ensureDir(`scopes/${scopeKey}/audio`)
  if (!dir.ok) return dir

  const remotes = buildPlaybackStreamCandidates(
    context,
    track.id,
    userId,
    bitrateForPreset(downloadPreset()),
  )
  if (remotes.length === 0) {
    return err(appError('network', 'No download stream URL'))
  }

  const headers = context.accessToken
    ? { 'X-Emby-Token': context.accessToken }
    : undefined

  try {
    const lyricsDirPromise = ensureDir(`scopes/${scopeKey}/lyrics`)
    const lyricsPromise = fetchLyrics(context, track.id)
    type DownloadedFile = Awaited<ReturnType<typeof File.downloadFileAsync>>
    const downloadFirst = async (
      index: number,
      lastCause?: unknown,
    ): Promise<DownloadedFile> => {
      const remote = remotes[index]
      if (remote == null) {
        throw lastCause ?? new Error('Track download failed')
      }
      const destination = new File(
        Paths.document,
        'melio',
        'scopes',
        scopeKey,
        'audio',
        track.id,
      )
      try {
        if (destination.exists) destination.delete()
        const file = await File.downloadFileAsync(remote, destination, {
          headers,
          idempotent: true,
        })
        const size = file.size ?? 0
        if (size < MIN_AUDIO_DOWNLOAD_BYTES) {
          if (file.exists) file.delete()
          return downloadFirst(
            index + 1,
            new Error(`download too small (${size})`),
          )
        }
        return file
      } catch (cause) {
        return downloadFirst(index + 1, cause)
      }
    }
    const downloaded = await downloadFirst(0)

    const extension = sniffAudioExtension(downloaded)
    const storedExt = extension
      ? (() => {
          try {
            downloaded.rename(`${track.id}.${extension}`)
            return extension
          } catch {
            return undefined
          }
        })()
      : undefined
    const relative = scopedAudioRelativePath(scopeKey, track.id, storedExt)
    const sizeBytes = downloaded.size ?? 0
    const [lyricsDir, lyricsResult] = await Promise.all([lyricsDirPromise, lyricsPromise])
    const lyricsPath =
      lyricsDir.ok &&
      lyricsResult.ok &&
      lyricsResult.value.lines.length > 0
        ? await (async () => {
            const relativeLyrics = scopedLyricsRelativePath(scopeKey, track.id)
            const written = await writeJsonFile(relativeLyrics, lyricsResult.value)
            return written.ok ? relativeLyrics : undefined
          })()
        : undefined
    return commitIndex(
      async (latest) => {
        const evictionIds = selectPrefetchEvictionsExcludingPacks(
          Object.values(latest.entries),
          latest.budgetBytes,
          totalSizeBytes(latest),
          sizeBytes,
          protectedPackIds(),
        )
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
      },
      { scopeKey },
    )
  } catch (cause) {
    if (kind === 'prefetch') {
      logger.warn('Track prefetch failed', { itemId: track.id, cause })
    } else {
      logger.error('Track download failed', { itemId: track.id, cause })
    }
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
