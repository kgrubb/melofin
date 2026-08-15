import { Platform } from 'react-native'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import type { PlaybackNetwork } from '@/src/domain/playbackSource'

const cache = { network: 'wifiLike' as PlaybackNetwork }

export const classifyPlaybackNetwork = (
  state: NetInfoState,
): PlaybackNetwork => {
  if (state.isConnected === false || state.isInternetReachable === false) {
    return 'offline'
  }
  if (
    state.type === 'wifi' ||
    state.type === 'ethernet' ||
    state.type === 'other'
  ) {
    return 'wifiLike'
  }
  if (state.isConnected) return 'cellular'
  return 'offline'
}

export const rememberPlaybackNetwork = (state: NetInfoState): PlaybackNetwork => {
  cache.network = classifyPlaybackNetwork(state)
  return cache.network
}

/** Updated by NetInfo listener. Safe to read during load. */
export const getPlaybackNetworkCached = (): PlaybackNetwork => cache.network

/** Wi-Fi-only library sync: interface type only (not isInternetReachable). */
export const isWifiLikeConnection = async (): Promise<boolean> => {
  if (Platform.OS === 'web') {
    const state = await NetInfo.fetch()
    return state.isConnected !== false
  }
  const state = await NetInfo.fetch()
  rememberPlaybackNetwork(state)
  if (state.type === 'wifi' || state.type === 'ethernet') return true
  return state.isConnected === true && state.type === 'other'
}
