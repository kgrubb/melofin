import { CarPlay } from 'react-native-carplay'
import { wireCarPlayHandlers } from '@/src/carplay/actions'
import {
  connectCarPlaySession,
  disconnectCarPlaySession,
  isCarPlaySessionConnected,
  syncCarPlaySession,
} from '@/src/carplay/session'
import { logger } from '@/src/logging/logger'

let wired = false

const ensureWired = () => {
  if (wired) return
  wireCarPlayHandlers()
  wired = true
}

const attachSession = (): void => {
  ensureWired()
  if (isCarPlaySessionConnected()) syncCarPlaySession()
  else connectCarPlaySession()
}

CarPlay.registerOnConnect(() => {
  try {
    attachSession()
  } catch (cause) {
    logger.warn('CarPlay skipped', { cause })
  }
})

CarPlay.registerOnDisconnect(() => {
  try {
    disconnectCarPlaySession()
  } catch (cause) {
    logger.warn('CarPlay disconnect failed', { cause })
  }
})

/**
 * Re-check native connection. CarPlay often connects before the JS bridge is
 * ready; `didConnect` is dropped and `CarPlay.connected` stays false. Calling
 * `checkForConnection` after listeners are wired re-emits the event.
 */
export const registerCarPlay = (): void => {
  try {
    ensureWired()
    CarPlay.bridge.checkForConnection()
    if (CarPlay.connected) attachSession()
  } catch (cause) {
    logger.warn('CarPlay skipped', { cause })
  }
}
