const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

/** FNV-1a 32-bit hex. Stable across JS engines for path segments. */
export const stableHash = (input: string): string => {
  // Indexed loop is intentional: charCodeAt in a tight pass beats spread/reduce here.
  let hash = FNV_OFFSET
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export type AccountScope = {
  readonly serverUrl: string
  readonly userId: string
}

export const accountScopeKey = (scope: AccountScope): string =>
  `${stableHash(scope.serverUrl)}:${scope.userId}`

/** Deterministic `Math.random` stand-in. Same seed → same sequence. */
export const unitRandomFromSeed = (seed: string): (() => number) => {
  let rng: { readonly state: number } = {
    state: Number.parseInt(stableHash(seed), 16) || 1,
  }
  return () => {
    const state = (Math.imul(1664525, rng.state) + 1013904223) >>> 0
    rng = { state }
    return state / 4294967296
  }
}

export const scopedAudioRelativePath = (
  scopeKey: string,
  itemId: string,
  extension?: string,
): string => {
  const suffix =
    extension && extension.length > 0
      ? `.${extension.replace(/^\./, '')}`
      : ''
  return `scopes/${scopeKey}/audio/${itemId}${suffix}`
}

export const scopedOfflineIndexRelativePath = (scopeKey: string): string =>
  `scopes/${scopeKey}/offline-index.json`

export const scopedPacksRelativePath = (scopeKey: string): string =>
  `scopes/${scopeKey}/packs.json`

export const scopedLyricsRelativePath = (
  scopeKey: string,
  itemId: string,
): string => `scopes/${scopeKey}/lyrics/${itemId}.json`

export const isLegacyOfflineAudioPath = (path: string): boolean => {
  if (path.startsWith('file://') || path.startsWith('/')) return true
  return path.startsWith('audio/') && !path.startsWith('scopes/')
}
