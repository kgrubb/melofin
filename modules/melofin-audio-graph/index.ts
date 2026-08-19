import { requireNativeModule } from 'expo-modules-core'

export type MelofinEqGains = readonly number[]

export type AudioRouteNativeEvent = {
  readonly reason: string
  readonly previousPorts: readonly string[]
  readonly currentPorts: readonly string[]
}

export type AudioInterruptNativeEvent = {
  readonly type: 'began' | 'ended'
  readonly shouldResume: boolean
  readonly currentPorts: readonly string[]
}

type NativeSubscription = { readonly remove: () => void }

type MelofinAudioGraphNative = {
  readonly clearNext: () => void
  readonly setNextUri: (
    uri: string,
    headers?: Record<string, string>,
  ) => Promise<boolean>
  readonly playNextImmediate: (volume: number) => Promise<boolean>
  readonly crossfadeToNext: (durationSec: number) => Promise<boolean>
  readonly handoffPositionSec: () => number
  readonly setEqGains: (gainsDb: MelofinEqGains) => void
  readonly resetEq: () => void
  readonly isAvailable: () => boolean
  readonly addListener?: (
    eventName: string,
    listener: (event: Record<string, unknown>) => void,
  ) => NativeSubscription
}

let native: MelofinAudioGraphNative | null = null

const loadNative = (): MelofinAudioGraphNative | null => {
  if (native) return native
  try {
    native = requireNativeModule<MelofinAudioGraphNative>('MelofinAudioGraph')
    return native
  } catch {
    return null
  }
}

export const melofinAudioGraph = {
  isAvailable: (): boolean => {
    try {
      return Boolean(loadNative()?.isAvailable())
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
      return await mod.setNextUri(uri, headers ? { ...headers } : undefined)
    } catch {
      return false
    }
  },
  playNextImmediate: async (volume = 1): Promise<boolean> => {
    const mod = loadNative()
    if (!mod) return false
    try {
      return await mod.playNextImmediate(volume)
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
  handoffPositionSec: (): number => {
    try {
      const value = loadNative()?.handoffPositionSec()
      return typeof value === 'number' && Number.isFinite(value) ? value : 0
    } catch {
      return 0
    }
  },
  setEqGains: (gainsDb: MelofinEqGains): void => {
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

const EMPTY_PORTS: readonly string[] = []

const asStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : EMPTY_PORTS

export const subscribeAudioSession = (
  onRoute: (event: AudioRouteNativeEvent) => void,
  onInterruption: (event: AudioInterruptNativeEvent) => void,
): (() => void) => {
  const mod = loadNative()
  if (!mod?.addListener) return () => undefined
  try {
    const routeSub = mod.addListener('onAudioRoute', (event) => {
      onRoute({
        reason: typeof event.reason === 'string' ? event.reason : 'unknown',
        previousPorts: asStringArray(event.previousPorts),
        currentPorts: asStringArray(event.currentPorts),
      })
    })
    try {
      const interruptSub = mod.addListener('onAudioInterruption', (event) => {
        onInterruption({
          type: event.type === 'ended' ? 'ended' : 'began',
          shouldResume: event.shouldResume === true,
          currentPorts: asStringArray(event.currentPorts),
        })
      })
      return () => {
        routeSub.remove()
        interruptSub.remove()
      }
    } catch {
      routeSub.remove()
      return () => undefined
    }
  } catch {
    return () => undefined
  }
}
