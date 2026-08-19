import type { AudioPlayer } from 'expo-audio'
import { Platform } from 'react-native'
import { melofinAudioGraph } from 'melofin-audio-graph'
import type { LocalHandoffMode } from '@/src/domain/crossfade'
import { isLocalOutputEnabled } from '@/src/player/outputPolicy'
import { useSettingsStore } from '@/src/store/settings'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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
  const runStep = async (step: number): Promise<void> => {
    if (step > steps) return
    if (shouldAbort?.()) return
    const t = step / steps
    try {
      player.volume = start + (end - start) * t
    } catch {
      return
    }
    await sleep(stepMs)
    return runStep(step + 1)
  }
  await runStep(1)
}

/** Start primed next: immediate (gapless) or faded (crossfade). */
export const startLocalHandoff = async (
  mode: LocalHandoffMode,
  opts?: {
    readonly crossfadeSeconds?: number
    readonly volume?: number
  },
): Promise<boolean> => {
  if (Platform.OS === 'web' || !isLocalOutputEnabled()) return false
  if (!melofinAudioGraph.isAvailable()) return false
  if (mode === 'crossfade') {
    const durationSec = opts?.crossfadeSeconds ?? 0
    return durationSec > 0
      ? melofinAudioGraph.crossfadeToNext(durationSec)
      : false
  }
  return melofinAudioGraph.playNextImmediate(opts?.volume ?? 1)
}

export const localHandoffPositionSec = (): number =>
  melofinAudioGraph.handoffPositionSec()

export const localCrossfadeSeconds = (): number =>
  useSettingsStore.getState().crossfadeSeconds
