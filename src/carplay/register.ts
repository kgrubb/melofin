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

CarPlay.registerOnConnect(() => {
  try {
    ensureWired()
    connectCarPlaySession()
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

export const registerCarPlay = () => {
  try {
    ensureWired()
    if (!CarPlay.connected) return
    if (isCarPlaySessionConnected()) syncCarPlaySession()
    else connectCarPlaySession()
  } catch (cause) {
    logger.warn('CarPlay skipped', { cause })
  }
}
