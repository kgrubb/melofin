import type { AudioPlayer } from 'expo-audio'
import { Platform } from 'react-native'
import { melioAudioGraph } from 'melio-audio-graph'
import { isLocalOutputEnabled } from '@/src/player/outputPolicy'
import { useSettingsStore } from '@/src/store/settings'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Ramp expo-audio volume toward `target` over `durationSec`. */
export const fadePlayerVolume = async (
  player: AudioPlayer,
  target: number,
  durationSec: number,
  shouldAbort?: () => boolean,
): Promise<void> => {
  const start = Math.max(0, Math.min(1, player.volume))
  const end = Math.max(0, Math.min(1, target))
  if (durationSec <= 0 || Math.abs(start - end) < 0.01) {
    try {
      player.volume = end
    } catch {
      // Ignore.
    }
    return
  }
  const steps = Math.max(8, Math.floor(durationSec * 20))
  const stepMs = (durationSec * 1000) / steps
  for (let i = 1; i <= steps; i += 1) {
    if (shouldAbort?.()) return
    const t = i / steps
    try {
      player.volume = start + (end - start) * t
    } catch {
      return
    }
    await sleep(stepMs)
  }
}

/** Start native overlap. Caller fades primary and advances when overlap is done. */
export const startLocalCrossfade = async (
  durationSec: number,
): Promise<boolean> => {
  if (Platform.OS === 'web') return false
  if (!isLocalOutputEnabled()) return false
  if (durationSec <= 0) return false
  if (!melioAudioGraph.isAvailable()) return false
  return melioAudioGraph.crossfadeToNext(durationSec)
}

/**
 * Local overlap crossfade: native plays primed next while primary fades out.
 * Returns true when native overlap started (caller should still advance queue).
 */
export const runLocalCrossfade = async (
  player: AudioPlayer | null,
  durationSec: number,
  shouldAbort?: () => boolean,
): Promise<boolean> => {
  const ok = await startLocalCrossfade(durationSec)
  if (!ok) return false
  if (player) await fadePlayerVolume(player, 0, durationSec, shouldAbort)
  return !shouldAbort?.()
}

export const stopLocalCrossfade = (): void => {
  melioAudioGraph.stopCrossfade()
}

export const localCrossfadeSeconds = (): number =>
  useSettingsStore.getState().crossfadeSeconds
