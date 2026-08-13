import type { PlaybackNetwork } from '@/src/domain/playbackSource'

export type QualityPreset = 'low' | 'normal' | 'high'

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  'low',
  'normal',
  'high',
] as const

export const qualityPresetLabel = (preset: QualityPreset): string => {
  if (preset === 'low') return 'Low (128 kbps)'
  if (preset === 'normal') return 'Normal (192 kbps)'
  return 'High (320 kbps)'
}

export const bitrateForPreset = (preset: QualityPreset): number => {
  if (preset === 'low') return 128_000
  if (preset === 'normal') return 192_000
  return 320_000
}

export type StreamQualitySettings = {
  readonly automatic: boolean
  readonly wifi: QualityPreset
  readonly cellular: QualityPreset
  readonly download: QualityPreset
}

export const defaultStreamQuality = (): StreamQualitySettings => ({
  automatic: true,
  wifi: 'high',
  cellular: 'normal',
  download: 'high',
})

export const isQualityPreset = (value: unknown): value is QualityPreset =>
  value === 'low' || value === 'normal' || value === 'high'

/** Automatic: cellular→Normal, wifi→High (or explicit wifi/cellular when auto off). */
export const resolveStreamPreset = (
  settings: StreamQualitySettings,
  network: PlaybackNetwork,
): QualityPreset => {
  if (!settings.automatic) {
    return network === 'cellular' ? settings.cellular : settings.wifi
  }
  if (network === 'cellular') return 'normal'
  return 'high'
}

export const parseStreamQuality = (
  raw: Partial<StreamQualitySettings> | null | undefined,
): StreamQualitySettings => {
  const defaults = defaultStreamQuality()
  if (!raw) return defaults
  return {
    automatic: typeof raw.automatic === 'boolean' ? raw.automatic : defaults.automatic,
    wifi: isQualityPreset(raw.wifi) ? raw.wifi : defaults.wifi,
    cellular: isQualityPreset(raw.cellular) ? raw.cellular : defaults.cellular,
    download: isQualityPreset(raw.download) ? raw.download : defaults.download,
  }
}
