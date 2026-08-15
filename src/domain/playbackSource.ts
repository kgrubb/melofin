import type { OfflineIndex } from '@/src/domain/offline'
import { nextIndex, type QueueState } from '@/src/domain/queue'

export type PlaybackNetwork = 'offline' | 'cellular' | 'wifiLike'

export const FILE_LOAD_TIMEOUT_MS = 250
/** Cap for the first remote candidate — fail over before a long hang. */
export const REMOTE_FIRST_TIMEOUT_MS = 1_800
export const REMOTE_WIFI_TIMEOUT_MS = 2_500
export const REMOTE_CELLULAR_TIMEOUT_MS = 1_500
export const STALL_FAILOVER_MS = 9_000
export const POSITION_MOVE_MIN_MS = 400
/** After play(), require the playhead to move or fail the candidate. */
export const AUDIO_START_CONFIRM_MS = 700
export const AUDIO_START_MIN_POSITION_MS = 80
/** Prior-item EOF after a replace that never actually swapped sources. */
export const STALE_PRIOR_ITEM_MS = 5_000

export const remoteTimeoutMs = (network: PlaybackNetwork): number =>
  network === 'cellular' ? REMOTE_CELLULAR_TIMEOUT_MS : REMOTE_WIFI_TIMEOUT_MS

export type SourcePlanInput = {
  readonly fileUri: string | null
  readonly remoteUris: readonly string[]
  readonly network: PlaybackNetwork
  readonly jfReachable: boolean
  readonly platform: string
}

export type SourcePlan = {
  readonly uri: string
  readonly fallbackUris?: readonly string[]
  readonly fromCache: boolean
  readonly timeoutMsByUri: Readonly<Record<string, number>>
}

const timeoutsFor = (
  uris: readonly string[],
  fileUri: string | null,
  remoteMs: number,
): Readonly<Record<string, number>> =>
  Object.fromEntries(
    uris.map((uri, index) => {
      if (fileUri && uri === fileUri) return [uri, FILE_LOAD_TIMEOUT_MS]
      const firstRemote = fileUri ? index === 1 : index === 0
      return [
        uri,
        firstRemote ? Math.min(remoteMs, REMOTE_FIRST_TIMEOUT_MS) : remoteMs,
      ]
    }),
  )

/** URI order + per-URI load timeouts. */
export const planSourceCandidates = (
  input: SourcePlanInput,
): SourcePlan | null => {
  const { fileUri, remoteUris, network, jfReachable, platform } = input
  const remoteMs = remoteTimeoutMs(network === 'offline' ? 'cellular' : network)
  const allowRemote =
    jfReachable && network !== 'offline' && remoteUris.length > 0
  const preferFile = Boolean(fileUri) && platform !== 'web'

  if (preferFile && fileUri) {
    const fallbacks = allowRemote ? remoteUris : []
    const all = [fileUri, ...fallbacks]
    return {
      uri: fileUri,
      fallbackUris: fallbacks.length > 0 ? fallbacks : undefined,
      fromCache: true,
      timeoutMsByUri: timeoutsFor(all, fileUri, remoteMs),
    }
  }

  if (!allowRemote) return null
  const [uri, ...rest] = remoteUris
  if (!uri) return null
  const all = [uri, ...rest]
  return {
    uri,
    fallbackUris: rest.length > 0 ? rest : undefined,
    fromCache: false,
    timeoutMsByUri: timeoutsFor(all, null, remoteMs),
  }
}

export const excludeFailedUris = (
  uris: readonly string[],
  failed: ReadonlySet<string>,
): readonly string[] => uris.filter((uri) => !failed.has(uri))

/**
 * Candidate looked loaded but never produced audio — or is still the prior
 * item sitting at EOF. Buffering is not a failure.
 */
export const shouldAbandonSilentStart = (input: {
  readonly wantsPlay: boolean
  readonly elapsedMs: number
  readonly confirmWithinMs: number
  readonly positionMs: number
  readonly seekMs: number
  readonly isBuffering: boolean
  readonly playbackState?: string
}): boolean => {
  const state = (input.playbackState ?? '').toLowerCase()
  if (state === 'failed') return true
  if (!input.wantsPlay) return false
  if (input.elapsedMs < input.confirmWithinMs) return false
  if (input.isBuffering) return false
  const expected = Math.max(0, input.seekMs)
  if (expected < AUDIO_START_MIN_POSITION_MS) {
    if (input.positionMs > STALE_PRIOR_ITEM_MS) return true
    return input.positionMs < AUDIO_START_MIN_POSITION_MS
  }
  return input.positionMs < AUDIO_START_MIN_POSITION_MS
}

/** Stall when intending to play, not from cache, and position frozen long enough. */
export const shouldFailoverStall = (input: {
  readonly wantsPlay: boolean
  readonly playingFromCache: boolean
  readonly now: number
  readonly lastMovingAt: number
}): boolean => {
  if (!input.wantsPlay || input.playingFromCache) return false
  return input.now - input.lastMovingAt >= STALL_FAILOVER_MS
}

export const prefetchCountForNetwork = (
  network: PlaybackNetwork,
  jfReachable: boolean,
): number => {
  if (!jfReachable || network === 'offline') return 0
  if (network === 'cellular') return 2
  return 5
}

export const nextPlayableCachedIndex = (
  queue: QueueState,
  offlineIndex: OfflineIndex,
  fromIndex: number,
  maxHops = 10,
): number => {
  const walk = (index: number, hopsLeft: number): number => {
    if (hopsLeft <= 0) return -1
    const next = nextIndex({ ...queue, currentIndex: index })
    if (next < 0 || next === fromIndex) return -1
    const track = queue.tracks[next]
    if (track && offlineIndex.entries[track.id]?.complete) return next
    return walk(next, hopsLeft - 1)
  }
  return walk(fromIndex, maxHops)
}

export const shouldAutoAdvanceOnLoadFailure = (input: {
  readonly network: PlaybackNetwork
  readonly jfReachable: boolean
  readonly allRemotesTimedOut: boolean
}): boolean =>
  input.network === 'offline' ||
  !input.jfReachable ||
  input.allRemotesTimedOut

/** True when the URI looks like Jellyfin Direct Play (static container), not forced MP3. */
export const isDirectPlayRemoteUri = (uri: string): boolean => {
  if (!uri.includes('/Audio/')) return false
  if (uri.includes('/universal?')) return false
  if (uri.includes('/stream.mp3') && !/static=true/i.test(uri)) return false
  return uri.includes('/stream.') || /static=true/i.test(uri)
}

/**
 * Prefer Direct Play remotes, then universal, then forced /stream.mp3.
 * Dedupes while preserving first-seen order within each tier.
 */
export const orderRemotePlaybackUris = (
  uris: readonly string[],
): readonly string[] => {
  const direct: string[] = []
  const universal: string[] = []
  const transcode: string[] = []
  const seen = new Set<string>()
  for (const uri of uris) {
    if (seen.has(uri)) continue
    seen.add(uri)
    if (uri.includes('/universal?')) universal.push(uri)
    else if (isDirectPlayRemoteUri(uri)) direct.push(uri)
    else transcode.push(uri)
  }
  return [...direct, ...universal, ...transcode]
}

export const playMethodForResolvedUri = (
  uri: string,
  fromCache: boolean,
): 'DirectPlay' | 'Transcode' => {
  if (fromCache) return 'DirectPlay'
  return isDirectPlayRemoteUri(uri) ? 'DirectPlay' : 'Transcode'
}
