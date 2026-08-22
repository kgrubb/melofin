import { CarPlay } from 'react-native-carplay'
import { handleCarPlayItemPress } from '@/src/carplay/actions'
import { logger } from '@/src/logging/logger'
import { buildLibraryRootItems } from '@/src/carplay/templates'
import { createListTemplate, type CarPlayListHandle } from '@/src/carplay/nativeTemplates'
import { useSettingsStore } from '@/src/store/settings'

let root: CarPlayListHandle | null = null

const offlineEntries = () =>
  Object.values(useSettingsStore.getState().offlineIndex.entries)

const syncRoot = (reset = false) => {
  const items = buildLibraryRootItems(offlineEntries())
  if (root && CarPlay.connected && !reset) {
    root.setItems(items)
    return
  }
  root = createListTemplate('Library', items, handleCarPlayItemPress)
  if (CarPlay.connected) CarPlay.setRootTemplate(root.template)
}

CarPlay.registerOnConnect(() => {
  try {
    CarPlay.enableNowPlaying(true)
    syncRoot(true)
  } catch (cause) {
    logger.warn('CarPlay skipped', { cause })
  }
})

export const registerCarPlay = () => {
  try {
    if (CarPlay.connected) syncRoot(false)
  } catch (cause) {
    logger.warn('CarPlay skipped', { cause })
  }
}
