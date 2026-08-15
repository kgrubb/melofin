import { requireNativeModule } from 'expo-modules-core'

export type MelioEqGains = readonly number[]

type MelioAudioGraphNative = {
  readonly clearNext: () => void
  readonly setNextUri: (
    uri: string,
    headers?: Record<string, string>,
  ) => Promise<boolean>
  readonly crossfadeToNext: (durationSec: number) => Promise<boolean>
  readonly stopCrossfade: () => void
  readonly setEqGains: (gainsDb: MelioEqGains) => void
  readonly resetEq: () => void
  readonly isAvailable: () => boolean
}

let native: MelioAudioGraphNative | null = null

const loadNative = (): MelioAudioGraphNative | null => {
  if (native) return native
  try {
    native = requireNativeModule<MelioAudioGraphNative>('MelioAudioGraph')
    return native
  } catch {
    return null
  }
}

/** Native companion for crossfade priming — EQ/gapless are deferred. */
export const melioAudioGraph = {
  isAvailable: (): boolean => {
    const mod = loadNative()
    try {
      return Boolean(mod?.isAvailable())
    } catch {
      return false
    }
  },
  clearNext: (): void => {
    try {
      loadNative()?.clearNext()
    } catch {
      // Ignore.
    }
  },
  setNextUri: async (
    uri: string,
    headers?: Readonly<Record<string, string>>,
  ): Promise<boolean> => {
    const mod = loadNative()
    if (!mod) return false
    try {
      return await mod.setNextUri(
        uri,
        headers ? { ...headers } : undefined,
      )
    } catch {
      return false
    }
  },
  crossfadeToNext: async (durationSec: number): Promise<boolean> => {
    const mod = loadNative()
    if (!mod) return false
    try {
      return await mod.crossfadeToNext(durationSec)
    } catch {
      return false
    }
  },
  stopCrossfade: (): void => {
    try {
      loadNative()?.stopCrossfade()
    } catch {
      // Ignore.
    }
  },
  setEqGains: (gainsDb: MelioEqGains): void => {
    try {
      loadNative()?.setEqGains(gainsDb)
    } catch {
      // Ignore.
    }
  },
  resetEq: (): void => {
    try {
      loadNative()?.resetEq()
    } catch {
      // Ignore.
    }
  },
}
