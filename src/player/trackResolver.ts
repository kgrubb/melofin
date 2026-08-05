import type { QueueTrack } from '@/src/domain/queue'
import type { OfflineIndex } from '@/src/domain/offline'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { buildUniversalStreamUrl } from '@/src/services/jellyfin/library'

export type ResolvedSource = {
  readonly uri: string
  readonly playMethod: 'DirectPlay' | 'Transcode'
  readonly fromCache: boolean
}

export const resolveTrackSource = (
  track: QueueTrack,
  offlineIndex: OfflineIndex,
  context: JellyfinContext | null,
  userId: string,
): ResolvedSource | null => {
  const cached = offlineIndex.entries[track.id]
  if (cached?.complete) {
    return {
      uri: cached.path.startsWith('file://') ? cached.path : `file://${cached.path}`,
      playMethod: 'DirectPlay',
      fromCache: true,
    }
  }
  if (!context) return null
  return {
    uri: buildUniversalStreamUrl(context, track.id, userId),
    playMethod: 'DirectPlay',
    fromCache: false,
  }
}
