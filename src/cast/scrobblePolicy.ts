import type { CastSinkKind } from '@/src/cast/types'

/**
 * Melofin reports playstate for local/AirPlay/Cast (Melofin-driven).
 * Jellyfin remotes report themselves. Melofin must stay silent.
 */
export const shouldMelofinScrobble = (kind: CastSinkKind): boolean => kind !== 'jellyfin'

export const isLocalAudible = (kind: CastSinkKind): boolean =>
  kind === 'local' || kind === 'airplay'