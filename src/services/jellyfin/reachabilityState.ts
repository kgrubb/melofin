const REPROBE_MS = 30_000

const state = {
  reachable: true,
  checkedAt: 0,
}

export const getJellyfinReachable = (): boolean => state.reachable

export const markJellyfinReachable = (): void => {
  state.reachable = true
  state.checkedAt = Date.now()
}

export const markJellyfinUnreachable = (): void => {
  state.reachable = false
  state.checkedAt = Date.now()
}

export const shouldSkipReachableProbe = (now = Date.now()): boolean =>
  state.reachable && now - state.checkedAt < REPROBE_MS
