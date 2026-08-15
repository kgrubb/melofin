import { describe, expect, it } from 'vitest'
import {
  buildDownloadAlbums,
  buildDownloadPlaylists,
  bytesFromGb,
  collectionCountLabel,
  completeEntriesForIds,
  downloadsPackTrackIds,
  formatStorageBytes,
  isKeptOffline,
  keptOfflineEntries,
  nearestBudgetGb,
  packCollectionId,
  playAllEntries,
  storageMeter,
} from '@/src/domain/downloadsView'
import { emptyOfflineIndex, upsertEntry, type OfflineEntry } from '@/src/domain/offline'
import {
  emptySyncPackIndex,
  upsertSyncPack,
  type SyncPack,
} from '@/src/domain/syncPack'

const entry = (
  id: string,
  patch: Partial<OfflineEntry> = {},
): OfflineEntry => ({
  itemId: id,
  title: patch.title ?? id,
  artist: patch.artist ?? 'Artist',
  album: patch.album ?? 'Album',
  durationMs: patch.durationMs ?? 1,
  path: `/tmp/${id}`,
  sizeBytes: patch.sizeBytes ?? 100,
  artworkPath: patch.artworkPath,
  downloadedAt: patch.downloadedAt ?? 1,
  lastAccessedAt: patch.lastAccessedAt ?? 1,
  kind: patch.kind ?? 'user',
  complete: patch.complete ?? true,
})

const pack = (
  kind: SyncPack['kind'],
  collectionId: string,
  title: string,
  trackIds: readonly string[],
): SyncPack => ({
  id: `${kind}:${collectionId}`,
  kind,
  title,
  trackIds,
  createdAt: 1,
  updatedAt: 1,
})

describe('downloadsView storage', () => {
  it('formats bytes across units', () => {
    expect(formatStorageBytes(0)).toBe('0 B')
    expect(formatStorageBytes(512)).toBe('512 B')
    expect(formatStorageBytes(1536)).toBe('1.5 KB')
    expect(formatStorageBytes(12 * 1024)).toBe('12 KB')
    expect(formatStorageBytes(5.2 * 1024 * 1024)).toBe('5.2 MB')
    expect(formatStorageBytes(40 * 1024 * 1024)).toBe('40 MB')
    expect(formatStorageBytes(1.24 * 1024 * 1024 * 1024)).toBe('1.24 GB')
    expect(formatStorageBytes(12.34 * 1024 * 1024 * 1024)).toBe('12.3 GB')
  })

  it('snaps budgets to the nearest preset', () => {
    expect(bytesFromGb(8)).toBe(8 * 1024 * 1024 * 1024)
    expect(nearestBudgetGb(bytesFromGb(4))).toBe(4)
    expect(nearestBudgetGb(bytesFromGb(7))).toBe(8)
    expect(nearestBudgetGb(bytesFromGb(3))).toBe(4)
    expect(nearestBudgetGb(bytesFromGb(100))).toBe(32)
  })

  it('splits download vs prefetch cache and clamps the meter', () => {
    const index = upsertEntry(
      upsertEntry(
        upsertEntry(emptyOfflineIndex(1000), entry('kept', { kind: 'user', sizeBytes: 400 })),
        entry('cache', { kind: 'prefetch', sizeBytes: 800 }),
      ),
      entry('pending', { complete: false, sizeBytes: 50 }),
    )
    const meter = storageMeter(index, new Set())
    expect(meter.downloadBytes).toBe(400)
    expect(meter.cacheBytes).toBe(800)
    expect(meter.usedBytes).toBe(1200)
    expect(meter.ratio).toBe(1)
    expect(meter.overBudget).toBe(true)
    expect(meter.detail).toBe('1.2 KB on this device')
    expect(meter.accessibilityLabel).toBe('1.2 KB used, over the 1000 B limit')

    const empty = storageMeter(emptyOfflineIndex(0), new Set())
    expect(empty.ratio).toBe(0)
    expect(empty.overBudget).toBe(false)
    expect(empty.detail).toContain('on this device')
    expect(empty.accessibilityLabel).toContain('of')
  })

  it('treats pack-backed prefetch as a download, not cache', () => {
    const index = upsertEntry(
      emptyOfflineIndex(10_000),
      entry('in-pack', { kind: 'prefetch', sizeBytes: 200 }),
    )
    const meter = storageMeter(index, new Set(['in-pack']))
    expect(meter.downloadBytes).toBe(200)
    expect(meter.cacheBytes).toBe(0)
  })
})

describe('downloadsView collections', () => {
  it('lists every complete file, including prefetch, newest first', () => {
    const entries = {
      old: entry('old', { downloadedAt: 1, title: 'Old' }),
      fresh: entry('fresh', { downloadedAt: 9, title: 'Fresh' }),
      cache: entry('cache', { kind: 'prefetch', downloadedAt: 50 }),
      pack: entry('pack', { kind: 'prefetch', downloadedAt: 4 }),
      incomplete: entry('incomplete', { complete: false, downloadedAt: 99 }),
    }
    expect(isKeptOffline(entries.cache)).toBe(true)
    expect(isKeptOffline(entries.incomplete)).toBe(false)
    expect(keptOfflineEntries(entries).map((e) => e.itemId)).toEqual([
      'cache',
      'fresh',
      'pack',
      'old',
    ])
  })

  it('plays all in album then title order', () => {
    const ordered = playAllEntries([
      entry('b', { album: 'Zed', title: 'B' }),
      entry('a', { album: 'Awe', title: 'A' }),
      entry('c', { album: 'Awe', title: 'C' }),
    ])
    expect(ordered.map((e) => e.itemId)).toEqual(['a', 'c', 'b'])
  })

  it('groups album packs first, then leftover albums, and skips pack members', () => {
    const entries = {
      a1: entry('a1', { album: 'Packed', artist: 'P', artworkPath: 'file://a' }),
      a2: entry('a2', { album: 'Packed', artist: 'P' }),
      loose: entry('loose', { album: 'Loose', artist: 'L', sizeBytes: 50 }),
      other: entry('other', { album: 'Loose', artist: 'Q', sizeBytes: 25 }),
      unknown: entry('unknown', { album: '  ', artist: 'U' }),
    }
    const albums = buildDownloadAlbums(entries, [
      pack('album', 'al1', 'Packed Album', ['a1', 'a2', 'missing']),
    ])
    expect(albums.map((row) => row.title)).toEqual([
      'Packed Album',
      'Loose',
      'Loose',
      'Unknown Album',
    ])
    expect(albums[0]?.collectionId).toBe('al1')
    expect(albums[0]?.completeCount).toBe(2)
    expect(albums[0]?.totalCount).toBe(3)
    expect(albums[0]?.artworkUrl).toBe('file://a')
    expect(albums[0]?.progress).toBeCloseTo(2 / 3)
    expect(albums[1]?.artist).toBe('L')
    expect(albums[1]?.collectionId).toBeUndefined()

    const partial = buildDownloadAlbums(entries, [
      pack('album', 'al2', 'Partial', ['missing', 'a1']),
    ])
    expect(partial[0]?.artist).toBe('P')
    const inferred = buildDownloadAlbums(
      {
        z: entry('z', { album: 'Loose', artist: 'L', title: 'Zed' }),
        a: entry('a', { album: 'Loose', artist: 'L', title: 'Aye' }),
      },
      [],
    )
    expect(inferred[0]?.trackIds).toEqual(['a', 'z'])
  })

  it('builds playlist packs alphabetically with playlist artist label', () => {
    const entries = { t: entry('t', { artworkPath: 'file://p' }) }
    const playlists = buildDownloadPlaylists(entries, [
      pack('playlist', 'pl2', 'Zebra', ['t']),
      pack('playlist', 'pl1', 'Alpha', ['missing']),
      pack('album', 'al1', 'Not a playlist', ['t']),
    ])
    expect(playlists.map((row) => row.title)).toEqual(['Alpha', 'Zebra'])
    expect(playlists[0]?.artist).toBe('Playlist')
    expect(playlists[0]?.completeCount).toBe(0)
    expect(playlists[1]?.artworkUrl).toBe('file://p')
  })

  it('resolves pack ids, count labels, and complete members', () => {
    expect(packCollectionId(pack('album', 'id-1', 'A', []))).toBe('id-1')
    expect(
      packCollectionId({
        id: 'bare',
        kind: 'album',
        title: 'A',
        trackIds: [],
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toBe('bare')
    expect(collectionCountLabel(0, 0)).toBe('0 songs')
    expect(collectionCountLabel(1, 1)).toBe('1 song')
    expect(collectionCountLabel(2, 5)).toBe('2 of 5 songs')
    const byId = { a: entry('a'), b: entry('b', { complete: false }) }
    expect(completeEntriesForIds(['a', 'b', 'z'], byId).map((e) => e.itemId)).toEqual([
      'a',
    ])
    expect(
      downloadsPackTrackIds(
        upsertSyncPack(emptySyncPackIndex(), pack('playlist', 'p', 'P', ['x'])),
      ).has('x'),
    ).toBe(true)
  })
})
