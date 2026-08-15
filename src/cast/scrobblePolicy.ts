import type { CastSinkKind } from '@/src/cast/types'

/**
 * Melio reports playstate for local/AirPlay/Cast (Melio-driven).
 * Jellyfin remotes report themselves. Melio must stay silent.
 */
export const shouldMelioScrobble = (kind: CastSinkKind): boolean => kind !== 'jellyfin'

export const isLocalAudible = (kind: CastSinkKind): boolean =>
  kind === 'local' || kind === 'airplay'