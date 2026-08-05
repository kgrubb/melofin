import { Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'

/** True when the active connection is suitable for Wi‑Fi-only library sync. */
export const isWifiLikeConnection = async (): Promise<boolean> => {
  if (Platform.OS === 'web') {
    // Browser NetInfo is unreliable for “Wi‑Fi only”; treat online as allowed.
    const state = await NetInfo.fetch()
    return state.isConnected !== false
  }
  const state = await NetInfo.fetch()
  if (state.type === 'wifi' || state.type === 'ethernet') return true
  return state.isConnected === true && state.type === 'other'
}
