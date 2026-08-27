type LocalOutputListener = (enabled: boolean, wasEnabled: boolean) => void

type OutputPolicy = {
  readonly localOutputEnabled: boolean
  readonly melofinScrobbleEnabled: boolean
  readonly onLocalOutputChange: LocalOutputListener | null
}

let state: OutputPolicy = {
  localOutputEnabled: true,
  melofinScrobbleEnabled: true,
  onLocalOutputChange: null,
}

/** Cast / output sinks toggle whether local expo-audio should audibly play. */
export const setLocalOutputEnabled = (enabled: boolean): void => {
  const wasEnabled = state.localOutputEnabled
  if (wasEnabled === enabled) return
  state = { ...state, localOutputEnabled: enabled }
  state.onLocalOutputChange?.(enabled, wasEnabled)
}

export const setMelofinScrobbleEnabled = (enabled: boolean): void => {
  state = { ...state, melofinScrobbleEnabled: enabled }
}

export const isLocalOutputEnabled = (): boolean => state.localOutputEnabled

export const isMelofinScrobbleEnabled = (): boolean => state.melofinScrobbleEnabled

/** Avoid cast <-> engine import cycle. */
export const bindLocalOutputChange = (listener: LocalOutputListener | null): void => {
  state = { ...state, onLocalOutputChange: listener }
}
