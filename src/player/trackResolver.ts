import type { QueueTrack } from '@/src/domain/queue'
import type { OfflineIndex } from '@/src/domain/offline'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  audioAuthHeaders,
  buildPlaybackStreamCandidates,
} from '@/src/services/jellyfin/library'

export type ResolvedSource = {
  readonly uri: string
  readonly fallbackUris?: readonly string[]
  readonly headers?: Readonly<Record<string, string>>
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
  const [primary, ...fallbackUris] = buildPlaybackStreamCandidates(
    context,
    track.id,
    userId,
  )
  if (!primary) return null
  return {
    uri: primary,
    fallbackUris,
    headers: audioAuthHeaders(context),
    playMethod: 'DirectPlay',
    fromCache: false,
  }
}
