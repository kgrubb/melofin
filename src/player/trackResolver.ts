import type { QueueTrack } from '@/src/domain/queue'
import {
  resolveOfflineFileUri,
  type OfflineIndex,
} from '@/src/domain/offline'
import {
  planSourceCandidates,
  type PlaybackNetwork,
} from '@/src/domain/playbackSource'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  audioAuthHeaders,
  buildPlaybackStreamCandidates,
} from '@/src/services/jellyfin/library'
import { getJellyfinReachable } from '@/src/services/jellyfin/reachabilityState'

export type ResolveTrackOpts = {
  readonly network?: PlaybackNetwork
  readonly jfReachable?: boolean
  /** Pass `Platform.OS` from RN call sites; default is non-web (prefer local). */
  readonly platform?: string
  /** file://…/melio root for relative offline paths */
  readonly melioRootUri?: string
  /** When set, skip cache entries whose file is missing (instant remote fallback). */
  readonly fileExists?: (uri: string) => boolean
  readonly maxBitrate?: number
}

export type ResolvedSource = {
  readonly uri: string
  readonly fallbackUris?: readonly string[]
  readonly headers?: Readonly<Record<string, string>>
  readonly playMethod: 'DirectPlay' | 'Transcode'
  readonly fromCache: boolean
  readonly timeoutMsByUri: Readonly<Record<string, number>>
}

const cachedFileUri = (
  offlineIndex: OfflineIndex,
  itemId: string,
  melioRootUri?: string,
  fileExists?: (uri: string) => boolean,
): string | null => {
  const cached = offlineIndex.entries[itemId]
  if (!cached?.complete) return null
  const uri = resolveOfflineFileUri(cached.path, melioRootUri)
  if (fileExists && !fileExists(uri)) return null
  return uri
}

/** Prefer complete downloads (incl. prefetch) when the file exists; remotes as fallback. */
export const resolveTrackSource = (
  track: QueueTrack,
  offlineIndex: OfflineIndex,
  context: JellyfinContext | null,
  userId: string,
  opts?: ResolveTrackOpts,
): ResolvedSource | null => {
  const network = opts?.network ?? 'wifiLike'
  const jfReachable = opts?.jfReachable ?? getJellyfinReachable()
  const platform = opts?.platform ?? 'native'
  const fileUri = cachedFileUri(
    offlineIndex,
    track.id,
    opts?.melioRootUri,
    opts?.fileExists,
  )
  const remoteUris = context
    ? buildPlaybackStreamCandidates(
        context,
        track.id,
        userId,
        opts?.maxBitrate ?? 320_000,
      )
    : []

  const planned = planSourceCandidates({
    fileUri,
    remoteUris,
    network,
    jfReachable: Boolean(context) && jfReachable,
    platform,
  })
  if (!planned) return null

  return {
    uri: planned.uri,
    fallbackUris: planned.fallbackUris,
    headers: context ? audioAuthHeaders(context) : undefined,
    playMethod: planned.fromCache ? 'DirectPlay' : 'Transcode',
    fromCache: planned.fromCache,
    timeoutMsByUri: planned.timeoutMsByUri,
  }
}
