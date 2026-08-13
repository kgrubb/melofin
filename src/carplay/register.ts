import { CarPlay } from 'react-native-carplay'
import { handleCarPlayItemPress } from '@/src/carplay/actions'
import { logger } from '@/src/logging/logger'
import { buildLibrarySections } from '@/src/carplay/templates'
import { createBrowseTemplate } from '@/src/carplay/nativeTemplates'
import type { LibraryItem } from '@/src/services/jellyfin/library'
import type { OfflineEntry } from '@/src/domain/offline'

export const registerCarPlay = (
  playlists: readonly LibraryItem[],
  artists: readonly LibraryItem[],
  offline: readonly OfflineEntry[],
) => {
  try {
    const template = createBrowseTemplate(
      buildLibrarySections(playlists, artists, offline),
      (itemId) => {
        void handleCarPlayItemPress(itemId)
      },
    )
    const api = CarPlay as typeof CarPlay & {
      enable?: () => void
      setRootTemplate?: (template: unknown) => void
    }
    api.enable?.()
    api.setRootTemplate?.(template)
  } catch (cause) {
    logger.warn('CarPlay skipped', { cause })
  }
}
