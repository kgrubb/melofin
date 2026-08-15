import { melioAudioGraph } from 'melio-audio-graph'
import { effectiveEqGains, type EqSettings } from '@/src/domain/eqPresets'
import { nextIndex } from '@/src/domain/queue'
import { resolveTrackSource } from '@/src/player/trackResolver'
import { isLocalOutputEnabled } from '@/src/player/outputPolicy'
import { getPlaybackNetworkCached } from '@/src/services/network'
import { getJellyfinReachable } from '@/src/services/jellyfin/reachabilityState'
import { bitrateForPreset, resolveStreamPreset } from '@/src/domain/streamQuality'
import { melioRootUri, offlineAudioExists } from '@/src/storage/jsonFile'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { Platform } from 'react-native'

/** Clear native next queue + stop crossfade player. */
export const clearNativeNextQueue = (): void => {
  melioAudioGraph.clearNext()
}

export const applyNativeEq = (eq: EqSettings | undefined): void => {
  if (!isLocalOutputEnabled()) {
    melioAudioGraph.resetEq()
    return
  }
  const settings = eq ?? useSettingsStore.getState().eq
  melioAudioGraph.setEqGains(effectiveEqGains(settings))
}

/**
 * When gapless and/or crossfade is on and local output is active, resolve the
 * next queue URI and hand it to the native graph for pre-buffering.
 */
export const primeNextIfEnabled = async (): Promise<void> => {
  if (Platform.OS === 'web') return
  if (!isLocalOutputEnabled()) {
    clearNativeNextQueue()
    return
  }
  const settings = useSettingsStore.getState()
  if (settings.gaplessPlayback === false && settings.crossfadeSeconds === 0) {
    clearNativeNextQueue()
    return
  }

  const queue = usePlayerStore.getState()
  const next = nextIndex(queue)
  if (next < 0) {
    clearNativeNextQueue()
    return
  }
  const track = queue.tracks[next]
  const session = useSessionStore.getState()
  if (!track || !session.session || !session.context) {
    clearNativeNextQueue()
    return
  }

  const network = getPlaybackNetworkCached()
  const resolved = resolveTrackSource(
    track,
    settings.offlineIndex,
    session.context,
    session.session.userId,
    {
      network,
      jfReachable: getJellyfinReachable(),
      platform: Platform.OS,
      melioRootUri: melioRootUri(),
      fileExists: offlineAudioExists,
      maxBitrate: bitrateForPreset(
        resolveStreamPreset(settings.streamQuality, network),
      ),
    },
  )
  if (!resolved) {
    clearNativeNextQueue()
    return
  }
  await melioAudioGraph.setNextUri(resolved.uri, resolved.headers)
}
