export type LibrarySyncMode = 'onOpen' | 'wifiOnly' | 'manual'

export type LibrarySyncTrigger = 'open' | 'manual'

export type LibrarySyncPhase =
  | 'idle'
  | 'collections'
  | 'songs'
  | 'saving'

export type LibrarySyncProgress = {
  readonly phase: LibrarySyncPhase
  readonly songsLoaded: number
  readonly songsTotal: number
}

export const LIBRARY_SYNC_MODES: readonly LibrarySyncMode[] = [
  'onOpen',
  'wifiOnly',
  'manual',
]

const IDLE_SYNC_PROGRESS: LibrarySyncProgress = {
  phase: 'idle',
  songsLoaded: 0,
  songsTotal: 0,
}

export const idleSyncProgress = (): LibrarySyncProgress => IDLE_SYNC_PROGRESS

export const librarySyncModeLabel = (mode: LibrarySyncMode): string => {
  if (mode === 'onOpen') return 'On open'
  if (mode === 'wifiOnly') return 'Wi‑Fi only'
  return 'Manual'
}

/** Whether a sync should run for this mode and network. Manual always allowed. */
export const shouldSyncLibrary = ({
  mode,
  trigger,
  isWifi,
}: {
  readonly mode: LibrarySyncMode
  readonly trigger: LibrarySyncTrigger
  readonly isWifi: boolean
}): boolean => {
  if (trigger === 'manual') return true
  if (mode === 'manual') return false
  if (mode === 'wifiOnly') return isWifi
  return true
}

export const formatLibrarySyncedAt = (syncedAt: number | null): string => {
  if (syncedAt === null) return 'Never synced'
  return `Last synced ${new Date(syncedAt).toLocaleString()}`
}

/** Detail line under the sync control. */
export const formatLibrarySyncProgress = (
  progress: LibrarySyncProgress,
): string => {
  if (progress.phase === 'collections') return 'Updating collections…'
  if (progress.phase === 'saving') return 'Saving to device…'
  if (progress.phase === 'songs') {
    const loaded = progress.songsLoaded
    const total = progress.songsTotal
    if (total > 0) {
      return `Songs ${loaded.toLocaleString()} of ${total.toLocaleString()}`
    }
    if (loaded > 0) return `Songs ${loaded.toLocaleString()}…`
    return 'Fetching songs…'
  }
  return 'Syncing…'
}

/** 0–1 when song paging has a known total; otherwise null (indeterminate). */
export const librarySyncFraction = (
  progress: LibrarySyncProgress,
): number | null => {
  if (progress.phase === 'saving') return 1
  if (progress.phase !== 'songs' || progress.songsTotal <= 0) return null
  return Math.min(1, progress.songsLoaded / progress.songsTotal)
}

export const formatLibrarySyncButton = (
  syncing: boolean,
  progress: LibrarySyncProgress,
): string => {
  if (!syncing) return 'Sync Now'
  if (progress.phase === 'saving') return 'Saving…'
  const fraction = librarySyncFraction(progress)
  if (fraction != null) return `Syncing ${Math.round(fraction * 100)}%`
  return 'Syncing…'
}

/** False when a cached catalog belongs to another server or user. Missing userId is legacy. */
export const libraryCacheBelongsToSession = (
  cache: {
    readonly serverUrl: string | null
    readonly userId?: string | null
  },
  session: { readonly serverUrl: string; readonly userId: string },
): boolean => {
  if (cache.serverUrl && cache.serverUrl !== session.serverUrl) return false
  if (cache.userId && cache.userId !== session.userId) return false
  return true
}

export const librarySectionsEmpty = ({
  songs,
  albums,
  artists,
  playlists,
}: {
  readonly songs: readonly unknown[]
  readonly albums: readonly unknown[]
  readonly artists: readonly unknown[]
  readonly playlists: readonly unknown[]
}): boolean =>
  songs.length === 0 &&
  albums.length === 0 &&
  artists.length === 0 &&
  playlists.length === 0

export type SongSyncPhase = 'delta' | 'full'

export type SongSyncAfterDelta = 'skip' | 'upsertOk' | 'full'

export type SongSyncFetchPlan = {
  readonly pageSize: number
  readonly concurrency: number
}

/** First sync / schema bump → full; otherwise try MinDateLastSaved delta. */
export const songSyncPhase = ({
  schemaStale,
  songsSyncedAt,
  localCount,
}: {
  readonly schemaStale: boolean
  readonly songsSyncedAt: number | null
  readonly localCount: number
}): SongSyncPhase =>
  schemaStale || songsSyncedAt == null || localCount === 0 ? 'full' : 'delta'

/**
 * After a delta pull (and optional upsert), decide whether counts agree.
 * `localCount` is post-upsert when deltaLength > 0.
 */
export const songSyncAfterDelta = ({
  remoteCount,
  localCount,
  deltaLength,
}: {
  readonly remoteCount: number
  readonly localCount: number
  readonly deltaLength: number
}): SongSyncAfterDelta => {
  if (deltaLength === 0 && remoteCount === localCount) return 'skip'
  if (deltaLength > 0 && localCount === remoteCount) return 'upsertOk'
  return 'full'
}

/** Stamp watermark from pull start, not end — overlap for clock skew / in-flight saves. */
export const songDeltaWatermarkMs = (pullStartedAt: number): number =>
  pullStartedAt - 60_000

export const songSyncFetchPlan = (isWifi: boolean): SongSyncFetchPlan =>
  isWifi
    ? { pageSize: 400, concurrency: 2 }
    : { pageSize: 200, concurrency: 1 }
