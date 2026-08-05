import type { LibraryItem } from '@/src/services/jellyfin/library'
import type { OfflineEntry } from '@/src/domain/offline'

/** CarPlay is iOS-only. Web preview skips native registration. */
export const registerCarPlay = (
  _playlists: readonly LibraryItem[],
  _artists: readonly LibraryItem[],
  _offline: readonly OfflineEntry[],
) => undefined
