import { CarPlay } from 'react-native-carplay'
import { wireCarPlayHandlers } from '@/src/carplay/actions'
import {
  connectCarPlaySession,
  disconnectCarPlaySession,
  isCarPlaySessionConnected,
  syncCarPlaySession,
} from '@/src/carplay/session'
import { resetCarPlaySearchOpen } from '@/src/carplay/search'
import { logger } from '@/src/logging/logger'

// Rebuild root on every native connect. Reconnect can leave stale list rows.
CarPlay.registerOnConnect(() => {
  try {
    wireCarPlayHandlers()
    resetCarPlaySearchOpen()
    connectCarPlaySession()
  } catch (cause) {
    logger.warn('CarPlay skipped', { cause })
  }
})

CarPlay.registerOnDisconnect(() => {
  try {
    resetCarPlaySearchOpen()
    disconnectCarPlaySession()
  } catch (cause) {
    logger.warn('CarPlay disconnect failed', { cause })
  }
})

/** Wire handlers. Recover a missed connect or sync an existing session. */
export const registerCarPlay = (): void => {
  try {
    wireCarPlayHandlers()
    if (isCarPlaySessionConnected()) {
      syncCarPlaySession()
      return
    }
    CarPlay.bridge.checkForConnection()
    // didConnect usually connects. Only connect here if the event was already applied.
    if (CarPlay.connected && !isCarPlaySessionConnected()) {
      connectCarPlaySession()
    }
  } catch (cause) {
    logger.warn('CarPlay skipped', { cause })
  }
}
