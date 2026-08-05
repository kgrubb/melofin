export type LibrarySyncMode = 'onOpen' | 'wifiOnly' | 'manual'

export type LibrarySyncTrigger = 'open' | 'manual'

export const LIBRARY_SYNC_MODES: readonly LibrarySyncMode[] = [
  'onOpen',
  'wifiOnly',
  'manual',
]

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
