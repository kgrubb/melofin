import { describe, expect, it } from 'vitest'
import {
  createOrRefreshPack,
  diffPackDownloads,
  emptySyncPackIndex,
  packProgress,
  packTrackIdSet,
  parseSyncPackIndex,
  removeSyncPack,
  selectPrefetchEvictionsExcludingPacks,
  syncPackId,
  upsertSyncPack,
} from '@/src/domain/syncPack'

describe('syncPack', () => {
  it('creates, diffs, and protects pack members from prefetch eviction', () => {
    const pack = createOrRefreshPack({
      kind: 'album',
      collectionId: 'al1',
      title: 'Album',
      trackIds: ['a', 'b', 'c'],
      now: 10,
    })
    expect(pack.id).toBe(syncPackId('album', 'al1'))
    let index = upsertSyncPack(emptySyncPackIndex(), pack)
    expect(packTrackIdSet(index).has('b')).toBe(true)
    const progress = packProgress(pack, new Set(['a']))
    expect(progress.complete).toBe(1)
    expect(diffPackDownloads(pack.trackIds, new Set(['a']))).toEqual(['b', 'c'])

    const evict = selectPrefetchEvictionsExcludingPacks(
      [
        {
          itemId: 'a',
          kind: 'prefetch',
          complete: true,
          lastAccessedAt: 1,
          sizeBytes: 100,
        },
        {
          itemId: 'x',
          kind: 'prefetch',
          complete: true,
          lastAccessedAt: 2,
          sizeBytes: 100,
        },
      ],
      150,
      200,
      0,
      packTrackIdSet(index),
    )
    expect(evict).toEqual(['x'])

    index = removeSyncPack(index, pack.id)
    expect(index.packs[pack.id]).toBeUndefined()
    expect(parseSyncPackIndex({ packs: { [pack.id]: pack } }).packs[pack.id]?.title).toBe(
      'Album',
    )
    expect(parseSyncPackIndex(null).packs).toEqual({})
    expect(parseSyncPackIndex({ packs: { bad: { kind: 'x' } } }).packs).toEqual({})
    expect(
      selectPrefetchEvictionsExcludingPacks(
        [],
        100,
        10,
        0,
        new Set(),
      ),
    ).toEqual([])
  })
})
