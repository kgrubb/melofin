import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { probePublicInfo } from '@/src/services/jellyfin/client'
import {
  getJellyfinReachable,
  markJellyfinReachable,
  markJellyfinUnreachable,
  shouldSkipReachableProbe,
} from '@/src/services/jellyfin/reachabilityState'
import { rememberPlaybackNetwork } from '@/src/services/network'
import { useSessionStore } from '@/src/store/session'

export const probeJellyfinReachability = async (): Promise<boolean> => {
  if (shouldSkipReachableProbe()) return true
  const context = useSessionStore.getState().context
  if (!context) return getJellyfinReachable()
  const result = await probePublicInfo(context.serverUrl)
  if (result.ok) {
    markJellyfinReachable()
    return true
  }
  markJellyfinUnreachable()
  return false
}

export const startJellyfinReachability = (): (() => void) => {
  const onNet = (net: NetInfoState) => {
    rememberPlaybackNetwork(net)
    if (net.isConnected === false || net.isInternetReachable === false) {
      markJellyfinUnreachable()
      return
    }
    void probeJellyfinReachability()
  }

  void NetInfo.fetch().then(onNet)
  const sub = NetInfo.addEventListener(onNet)
  return () => sub()
}
