import type { AudioPlayer } from 'expo-audio'
import type { LocalHandoffMode } from '@/src/domain/crossfade'
import { useSettingsStore } from '@/src/store/settings'

export const fadePlayerVolume = async (
  player: AudioPlayer,
  target: number,
  _durationSec: number,
  _shouldAbort?: () => boolean,
): Promise<void> => {
  try {
    player.volume = Math.max(0, Math.min(1, target))
  } catch {
    // Ignore.
  }
}

export const startLocalHandoff = async (
  _mode: LocalHandoffMode,
  _opts?: {
    readonly crossfadeSeconds?: number
    readonly volume?: number
  },
): Promise<boolean> => false

export const localHandoffPositionSec = (): number => 0

export const localCrossfadeSeconds = (): number =>
  useSettingsStore.getState().crossfadeSeconds
