import { describe, expect, it } from 'vitest'
import { emptyOfflineIndex, upsertEntry } from '@/src/domain/offline'
import {
  FILE_LOAD_TIMEOUT_MS,
  excludeFailedUris,
  isDirectPlayRemoteUri,
  nextPlayableCachedIndex,
  orderRemotePlaybackUris,
  planSourceCandidates,
  playMethodForResolvedUri,
  prefetchCountForNetwork,
  REMOTE_CELLULAR_TIMEOUT_MS,
  REMOTE_FIRST_TIMEOUT_MS,
  REMOTE_WIFI_TIMEOUT_MS,
  shouldAbandonSilentStart,
  shouldAutoAdvanceOnLoadFailure,
  shouldFailoverStall,
  STALL_FAILOVER_START_MS,
} from '@/src/domain/playbackSource'
import { emptyQueue, playItems, type QueueTrack } from '@/src/domain/queue'

const track = (id: string): QueueTrack => ({
  id,
  title: id,
  artist: 'a',
  album: 'b',
  durationMs: 1,
})

describe('playbackSource', () => {
  it('prefers file with remote fallbacks when reachable; file-only when not', () => {
    const withRemotes = planSourceCandidates({
      fileUri: 'file:///a',
      remoteUris: ['https://jf/stream', 'https://jf/universal'],
      network: 'wifiLike',
      jfReachable: true,
      platform: 'ios',
    })
    expect(withRemotes?.uri).toBe('file:///a')
    expect(withRemotes?.fromCache).toBe(true)
    expect(withRemotes?.fallbackUris).toEqual([
      'https://jf/stream',
      'https://jf/universal',
    ])
    expect(withRemotes?.timeoutMsByUri['file:///a']).toBe(FILE_LOAD_TIMEOUT_MS)
    expect(withRemotes?.timeoutMsByUri['https://jf/stream']).toBe(
      REMOTE_FIRST_TIMEOUT_MS,
    )
    expect(withRemotes?.timeoutMsByUri['https://jf/universal']).toBe(
      REMOTE_WIFI_TIMEOUT_MS,
    )

    const offline = planSourceCandidates({
      fileUri: 'file:///a',
      remoteUris: ['https://jf/stream'],
      network: 'offline',
      jfReachable: false,
      platform: 'ios',
    })
    expect(offline?.fallbackUris).toBeUndefined()
  })

  it('uses stream-first on web and cellular remote timeouts', () => {
    const web = planSourceCandidates({
      fileUri: 'file:///a',
      remoteUris: ['https://jf/stream'],
      network: 'wifiLike',
      jfReachable: true,
      platform: 'web',
    })
    expect(web?.uri).toBe('https://jf/stream')
    expect(web?.fromCache).toBe(false)

    const cell = planSourceCandidates({
      fileUri: null,
      remoteUris: ['https://jf/stream'],
      network: 'cellular',
      jfReachable: true,
      platform: 'ios',
    })
    expect(cell?.timeoutMsByUri['https://jf/stream']).toBe(
      Math.min(REMOTE_CELLULAR_TIMEOUT_MS, REMOTE_FIRST_TIMEOUT_MS),
    )
  })

  it('detects stalls and plans prefetch / auto-advance', () => {
    expect(
      shouldFailoverStall({
        wantsPlay: true,
        playingFromCache: false,
        now: 10_000,
        lastMovingAt: 500,
      }),
    ).toBe(true)
    expect(
      shouldFailoverStall({
        wantsPlay: true,
        playingFromCache: true,
        now: 10_000,
        lastMovingAt: 500,
      }),
    ).toBe(false)
    expect(
      shouldFailoverStall({
        wantsPlay: true,
        playingFromCache: false,
        now: 2_000,
        lastMovingAt: 0,
        lastLoadedAt: 0,
      }),
    ).toBe(false)
    expect(
      shouldFailoverStall({
        wantsPlay: true,
        playingFromCache: false,
        now: STALL_FAILOVER_START_MS,
        lastMovingAt: 0,
        lastLoadedAt: 0,
      }),
    ).toBe(true)
    expect(
      shouldFailoverStall({
        wantsPlay: true,
        playingFromCache: false,
        now: STALL_FAILOVER_START_MS,
        lastMovingAt: 0,
        lastLoadedAt: 0,
        nativePlaying: false,
        isBuffering: false,
      }),
    ).toBe(true)
    expect(
      shouldFailoverStall({
        wantsPlay: true,
        playingFromCache: false,
        now: 10_000,
        lastMovingAt: 500,
        lastLoadedAt: 0,
        nativePlaying: false,
        isBuffering: false,
      }),
    ).toBe(false)

    expect(prefetchCountForNetwork('wifiLike', true)).toBe(5)
    expect(prefetchCountForNetwork('cellular', true)).toBe(2)
    expect(prefetchCountForNetwork('wifiLike', false)).toBe(0)

    expect(
      shouldAutoAdvanceOnLoadFailure({
        network: 'wifiLike',
        jfReachable: true,
        allRemotesTimedOut: false,
      }),
    ).toBe(false)
    expect(
      shouldAutoAdvanceOnLoadFailure({
        network: 'wifiLike',
        jfReachable: true,
        allRemotesTimedOut: true,
      }),
    ).toBe(true)
  })

  it('finds the next cached playable index without returning fromIndex', () => {
    const queue = playItems(emptyQueue(), [
      track('a'),
      track('b'),
      track('c'),
    ])
    const index = upsertEntry(emptyOfflineIndex(), {
      itemId: 'c',
      title: 'c',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: 'file:///c',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'prefetch',
      complete: true,
    })
    expect(nextPlayableCachedIndex(queue, index, 0)).toBe(2)
    expect(nextPlayableCachedIndex(queue, emptyOfflineIndex(), 0)).toBe(-1)
  })

  it('orders Direct Play before universal and stream.mp3', () => {
    const ordered = orderRemotePlaybackUris([
      'https://jf/Audio/1/stream.mp3?x=1',
      'https://jf/Audio/1/universal?x=1',
      'https://jf/Audio/1/stream.flac?static=true',
      'https://jf/Audio/1/stream.mp3?x=1',
    ])
    expect(ordered).toEqual([
      'https://jf/Audio/1/stream.flac?static=true',
      'https://jf/Audio/1/universal?x=1',
      'https://jf/Audio/1/stream.mp3?x=1',
    ])
    expect(isDirectPlayRemoteUri(ordered[0]!)).toBe(true)
    expect(
      isDirectPlayRemoteUri('https://jf/Audio/1/stream?static=true'),
    ).toBe(true)
    expect(playMethodForResolvedUri(ordered[0]!, false)).toBe('DirectPlay')
    expect(playMethodForResolvedUri(ordered[2]!, false)).toBe('Transcode')
    expect(playMethodForResolvedUri('file:///x', true)).toBe('DirectPlay')
  })

  it('drops already-failed URIs and abandons silent starts', () => {
    expect(
      excludeFailedUris(['a', 'b', 'c'], new Set(['b'])),
    ).toEqual(['a', 'c'])
    expect(
      shouldAbandonSilentStart({
        wantsPlay: true,
        elapsedMs: 200,
        confirmWithinMs: 700,
        positionMs: 0,
        seekMs: 0,
        isBuffering: false,
      }),
    ).toBe(false)
    expect(
      shouldAbandonSilentStart({
        wantsPlay: true,
        elapsedMs: 700,
        confirmWithinMs: 700,
        positionMs: 0,
        seekMs: 0,
        isBuffering: false,
      }),
    ).toBe(true)
    expect(
      shouldAbandonSilentStart({
        wantsPlay: true,
        elapsedMs: 700,
        confirmWithinMs: 700,
        positionMs: 0,
        seekMs: 0,
        isBuffering: true,
      }),
    ).toBe(false)
    expect(
      shouldAbandonSilentStart({
        wantsPlay: true,
        elapsedMs: 700,
        confirmWithinMs: 700,
        positionMs: 180_000,
        seekMs: 0,
        isBuffering: false,
      }),
    ).toBe(true)
    expect(
      shouldAbandonSilentStart({
        wantsPlay: true,
        elapsedMs: 10,
        confirmWithinMs: 700,
        positionMs: 0,
        seekMs: 0,
        isBuffering: false,
        playbackState: 'failed',
      }),
    ).toBe(true)
    expect(
      shouldAbandonSilentStart({
        wantsPlay: true,
        elapsedMs: 700,
        confirmWithinMs: 700,
        positionMs: 0,
        seekMs: 30_000,
        isBuffering: false,
      }),
    ).toBe(true)
    expect(
      shouldAbandonSilentStart({
        wantsPlay: true,
        elapsedMs: 700,
        confirmWithinMs: 700,
        positionMs: 30_200,
        seekMs: 30_000,
        isBuffering: false,
      }),
    ).toBe(false)
  })
})
