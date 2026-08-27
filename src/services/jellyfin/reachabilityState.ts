const REPROBE_MS = 30_000

type Reachability = {
  readonly reachable: boolean
  readonly checkedAt: number
}

let state: Reachability = {
  reachable: true,
  checkedAt: 0,
}

export const getJellyfinReachable = (): boolean => state.reachable

export const markJellyfinReachable = (): void => {
  state = { reachable: true, checkedAt: Date.now() }
}

export const markJellyfinUnreachable = (): void => {
  state = { reachable: false, checkedAt: Date.now() }
}

export const shouldSkipReachableProbe = (now = Date.now()): boolean =>
  state.reachable && now - state.checkedAt < REPROBE_MS
