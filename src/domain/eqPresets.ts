/** Ten-band graphic EQ presets — pure; gains in dB (−24…+24). */

export const EQ_BAND_HZ = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16_000,
] as const

export type EqBandHz = (typeof EQ_BAND_HZ)[number]

export type EqGains = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

export type EqPresetId = 'flat' | 'bassBoost' | 'trebleBoost' | 'vocal' | 'custom'

export type EqSettings = {
  readonly enabled: boolean
  readonly presetId: EqPresetId
  /** Active curve when enabled; ignored when disabled (unity). */
  readonly gainsDb: EqGains
}

export const FLAT_EQ_GAINS: EqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

export const EQ_PRESETS: Readonly<Record<Exclude<EqPresetId, 'custom'>, EqGains>> = {
  flat: FLAT_EQ_GAINS,
  bassBoost: [6, 5, 3, 1, 0, 0, 0, 0, 0, 0],
  trebleBoost: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  vocal: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
}

/** Five visual bands — each drives a pair of the native 10-band EQ. */
export const EQ_UI_BANDS = [
  { label: '60', indices: [0, 1] as const },
  { label: '250', indices: [2, 3] as const },
  { label: '1k', indices: [4, 5] as const },
  { label: '4k', indices: [6, 7] as const },
  { label: '16k', indices: [8, 9] as const },
] as const

export type FiveBandGains = readonly [number, number, number, number, number]

export const defaultEqSettings = (): EqSettings => ({
  enabled: false,
  presetId: 'flat',
  gainsDb: FLAT_EQ_GAINS,
})

export const clampEqGain = (db: number): number =>
  Math.max(-24, Math.min(24, Number.isFinite(db) ? db : 0))

export const normalizeEqGains = (raw: readonly number[] | undefined): EqGains => {
  const out = FLAT_EQ_GAINS.map((_, i) => clampEqGain(raw?.[i] ?? 0))
  return out as unknown as EqGains
}

export const effectiveEqGains = (settings: EqSettings): EqGains => {
  if (!settings.enabled) return FLAT_EQ_GAINS
  if (settings.presetId !== 'custom' && EQ_PRESETS[settings.presetId]) {
    return EQ_PRESETS[settings.presetId]
  }
  return normalizeEqGains(settings.gainsDb)
}

/** Average each UI band’s paired native gains for the visual sliders. */
export const fiveBandGainsFromTen = (gains: EqGains): FiveBandGains => {
  const values = EQ_UI_BANDS.map(({ indices }) => {
    const a = gains[indices[0]] ?? 0
    const b = gains[indices[1]] ?? 0
    return clampEqGain((a + b) / 2)
  })
  return values as unknown as FiveBandGains
}

/** Set one visual band (writes both paired native bands). */
export const setFiveBandGain = (
  gains: EqGains,
  bandIndex: number,
  db: number,
): EqGains => {
  const band = EQ_UI_BANDS[bandIndex]
  if (!band) return gains
  const next = [...gains] as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const value = clampEqGain(db)
  next[band.indices[0]] = value
  next[band.indices[1]] = value
  return next
}

export const parseEqSettings = (raw: unknown): EqSettings => {
  const defaults = defaultEqSettings()
  if (!raw || typeof raw !== 'object') return defaults
  const o = raw as Record<string, unknown>
  const presetId =
    o.presetId === 'flat' ||
    o.presetId === 'bassBoost' ||
    o.presetId === 'trebleBoost' ||
    o.presetId === 'vocal' ||
    o.presetId === 'custom'
      ? o.presetId
      : defaults.presetId
  return {
    enabled: o.enabled === true,
    presetId,
    gainsDb: normalizeEqGains(Array.isArray(o.gainsDb) ? o.gainsDb : undefined),
  }
}

export const eqPresetLabel = (id: EqPresetId): string => {
  switch (id) {
    case 'flat':
      return 'Flat'
    case 'bassBoost':
      return 'Bass boost'
    case 'trebleBoost':
      return 'Treble boost'
    case 'vocal':
      return 'Vocal'
    case 'custom':
      return 'Custom'
  }
}
