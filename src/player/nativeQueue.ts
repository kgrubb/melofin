import { melioAudioGraph } from 'melio-audio-graph'
import { effectiveEqGains, type EqSettings } from '@/src/domain/eqPresets'
import { nextIndex } from '@/src/domain/queue'
import { resolveTrackSource } from '@/src/player/trackResolver'
import { isLocalOutputEnabled } from '@/src/player/outputPolicy'
import { stateRef } from '@/src/player/engineState'
import { clearNativeNextQueue } from '@/src/player/nativeHandoff'
import { getPlaybackNetworkCached } from '@/src/services/network'
import { getJellyfinReachable } from '@/src/services/jellyfin/reachabilityState'
import { bitrateForPreset, resolveStreamPreset } from '@/src/domain/streamQuality'
import { melioRootUri, offlineAudioExists } from '@/src/storage/jsonFile'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { Platform } from 'react-native'

export const applyNativeEq = (eq: EqSettings | undefined): void => {
  if (!isLocalOutputEnabled()) {
    melioAudioGraph.resetEq()
    return
  }
  melioAudioGraph.setEqGains(
    effectiveEqGains(eq ?? useSettingsStore.getState().eq),
  )
}

/** Pre-buffer next queue URI for local gapless / crossfade handoff. */
export const primeNextTrack = async (): Promise<void> => {
  if (Platform.OS === 'web') return
  // Secondary is covering; replacing it here would drop audible audio.
  if (stateRef.handoffActive) return
  if (!isLocalOutputEnabled()) {
    clearNativeNextQueue()
    return
  }

  const queue = usePlayerStore.getState()
  const next = nextIndex(queue)
  const track = next >= 0 ? queue.tracks[next] : undefined
  const session = useSessionStore.getState()
  const settings = useSettingsStore.getState()
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
