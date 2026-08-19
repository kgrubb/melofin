type LocalOutputListener = (enabled: boolean, wasEnabled: boolean) => void

const state = {
  localOutputEnabled: true,
  melofinScrobbleEnabled: true,
  onLocalOutputChange: null as LocalOutputListener | null,
}

/** Cast / output sinks toggle whether local expo-audio should audibly play. */
export const setLocalOutputEnabled = (enabled: boolean): void => {
  const wasEnabled = state.localOutputEnabled
  if (wasEnabled === enabled) return
  state.localOutputEnabled = enabled
  state.onLocalOutputChange?.(enabled, wasEnabled)
}

export const setMelofinScrobbleEnabled = (enabled: boolean): void => {
  state.melofinScrobbleEnabled = enabled
}

export const isLocalOutputEnabled = (): boolean => state.localOutputEnabled

export const isMelofinScrobbleEnabled = (): boolean => state.melofinScrobbleEnabled

/** Avoid cast <-> engine import cycle. */
export const bindLocalOutputChange = (listener: LocalOutputListener | null): void => {
  state.onLocalOutputChange = listener
}
