import { describe, expect, it } from 'vitest'
import { emptyOfflineIndex, upsertEntry } from '@/src/domain/offline'
import { resolveTrackSource } from '@/src/player/trackResolver'
import type { JellyfinContext } from '@/src/services/jellyfin/client'

describe('trackResolver', () => {
  it('uses cached files when offline', () => {
    const index = upsertEntry(emptyOfflineIndex(), {
      itemId: '1',
      title: 't',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: '/data/1',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'user',
      complete: true,
    })
    const resolved = resolveTrackSource(
      { id: '1', title: 't', artist: 'a', album: 'b', durationMs: 1 },
      index,
      null,
      'user',
    )
    expect(resolved?.fromCache).toBe(true)
    expect(resolved?.uri).toContain('file://')
  })

  it('prefers complete cached files when online, with remote fallbacks', () => {
    const context = {
      serverUrl: 'https://jf.example',
      deviceId: 'dev',
      accessToken: 'token',
    } as JellyfinContext
    const index = upsertEntry(emptyOfflineIndex(), {
      itemId: '42',
      title: 't',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: 'file:///data/42',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'prefetch',
      complete: true,
    })
    const resolved = resolveTrackSource(
      { id: '42', title: 't', artist: 'a', album: 'b', durationMs: 1 },
      index,
      context,
      'user-1',
      { fileExists: () => true },
    )
    expect(resolved?.fromCache).toBe(true)
    expect(resolved?.uri).toBe('file:///data/42')
    expect(resolved?.fallbackUris?.[0]).toContain('/Audio/42/stream.mp3')
    expect(resolved?.headers?.['X-Emby-Token']).toBe('token')
    expect(resolved?.timeoutMsByUri[resolved.uri]).toBeGreaterThan(0)
  })

  it('skips missing cache files and uses remotes immediately', () => {
    const context = {
      serverUrl: 'https://jf.example',
      deviceId: 'dev',
      accessToken: 'token',
    } as JellyfinContext
    const index = upsertEntry(emptyOfflineIndex(), {
      itemId: '42',
      title: 't',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: 'file:///data/42',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'prefetch',
      complete: true,
    })
    const resolved = resolveTrackSource(
      { id: '42', title: 't', artist: 'a', album: 'b', durationMs: 1 },
      index,
      context,
      'user-1',
      { fileExists: () => false },
    )
    expect(resolved?.fromCache).toBe(false)
    expect(resolved?.uri).toContain('/Audio/42/stream.mp3')
  })

  it('drops remotes when Jellyfin is marked unreachable', () => {
    const context = {
      serverUrl: 'https://jf.example',
      deviceId: 'dev',
      accessToken: 'token',
    } as JellyfinContext
    const index = upsertEntry(emptyOfflineIndex(), {
      itemId: '42',
      title: 't',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: 'file:///data/42',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'prefetch',
      complete: true,
    })
    const resolved = resolveTrackSource(
      { id: '42', title: 't', artist: 'a', album: 'b', durationMs: 1 },
      index,
      context,
      'user-1',
      { jfReachable: false, network: 'cellular', platform: 'ios' },
    )
    expect(resolved?.uri).toBe('file:///data/42')
    expect(resolved?.fallbackUris).toBeUndefined()
  })

  it('stream-first on web even when a file exists', () => {
    const context = {
      serverUrl: 'https://jf.example',
      deviceId: 'dev',
      accessToken: 'token',
    } as JellyfinContext
    const index = upsertEntry(emptyOfflineIndex(), {
      itemId: '42',
      title: 't',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: 'file:///data/42',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'user',
      complete: true,
    })
    const resolved = resolveTrackSource(
      { id: '42', title: 't', artist: 'a', album: 'b', durationMs: 1 },
      index,
      context,
      'user-1',
      { platform: 'web', jfReachable: true, network: 'wifiLike' },
    )
    expect(resolved?.fromCache).toBe(false)
    expect(resolved?.uri).toContain('/Audio/42/stream.mp3')
  })

  it('streams remotely when online without a complete cache entry', () => {
    const context = {
      serverUrl: 'https://jf.example',
      deviceId: 'dev',
      accessToken: 'token',
    } as JellyfinContext
    const resolved = resolveTrackSource(
      { id: '42', title: 't', artist: 'a', album: 'b', durationMs: 1 },
      emptyOfflineIndex(),
      context,
      'user-1',
    )
    expect(resolved?.fromCache).toBe(false)
    expect(resolved?.uri).toContain('/Audio/42/stream.mp3')
    expect(resolved?.fallbackUris?.[0]).toContain('/Audio/42/universal?')
    expect(resolved?.headers?.['X-Emby-Token']).toBe('token')
  })

  it('returns null without context and ignores incomplete cache', () => {
    expect(
      resolveTrackSource(
        { id: '1', title: 't', artist: 'a', album: 'b', durationMs: 1 },
        emptyOfflineIndex(),
        null,
        'user',
      ),
    ).toBeNull()

    const incomplete = upsertEntry(emptyOfflineIndex(), {
      itemId: '1',
      title: 't',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: 'file:///data/1',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'prefetch',
      complete: false,
    })
    expect(
      resolveTrackSource(
        { id: '1', title: 't', artist: 'a', album: 'b', durationMs: 1 },
        incomplete,
        null,
        'user',
      ),
    ).toBeNull()

    const withScheme = upsertEntry(emptyOfflineIndex(), {
      itemId: '2',
      title: 't',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: 'file:///data/2',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'user',
      complete: true,
    })
    expect(
      resolveTrackSource(
        { id: '2', title: 't', artist: 'a', album: 'b', durationMs: 1 },
        withScheme,
        null,
        'user',
      )?.uri,
    ).toBe('file:///data/2')
  })
})
