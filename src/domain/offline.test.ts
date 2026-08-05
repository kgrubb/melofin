import { describe, expect, it } from 'vitest'
import {
  applyEvictions,
  emptyOfflineIndex,
  removeEntry,
  selectPrefetchEvictions,
  totalSizeBytes,
  touchEntry,
  upsertEntry,
  type OfflineEntry,
} from '@/src/domain/offline'

const entry = (
  id: string,
  size: number,
  kind: OfflineEntry['kind'],
  lastAccessedAt: number,
): OfflineEntry => ({
  itemId: id,
  title: id,
  artist: 'a',
  album: 'b',
  durationMs: 1,
  path: `/tmp/${id}`,
  sizeBytes: size,
  downloadedAt: 1,
  lastAccessedAt,
  kind,
  complete: true,
})

describe('offline index', () => {
  it('tracks total size', () => {
    const index = upsertEntry(
      upsertEntry(emptyOfflineIndex(100), entry('a', 40, 'prefetch', 1)),
      entry('b', 30, 'user', 2),
    )
    expect(totalSizeBytes(index)).toBe(70)
  })

  it('evicts only prefetch entries by LRU', () => {
    const index = upsertEntry(
      upsertEntry(
        upsertEntry(emptyOfflineIndex(100), entry('old', 40, 'prefetch', 1)),
        entry('keep', 40, 'user', 1),
      ),
      entry('new', 40, 'prefetch', 5),
    )
    expect(selectPrefetchEvictions(emptyOfflineIndex(100), 10)).toEqual([])
    const underBudget = upsertEntry(emptyOfflineIndex(100), entry('tiny', 10, 'prefetch', 1))
    expect(selectPrefetchEvictions(underBudget, 10)).toEqual([])
    const evictions = selectPrefetchEvictions(index, 50)
    expect(evictions[0]).toBe('old')
    expect(evictions).toContain('old')
    const next = applyEvictions(index, ['old'])
    expect(Object.keys(next.entries).sort()).toEqual(['keep', 'new'])
  })

  it('removes and touches entries', () => {
    const index = upsertEntry(emptyOfflineIndex(), entry('a', 10, 'user', 1))
    expect(removeEntry(index, 'a').entries).toEqual({})
    expect(touchEntry(index, 'missing', 99)).toBe(index)
    expect(touchEntry(index, 'a', 42).entries.a?.lastAccessedAt).toBe(42)
  })

  it('stops eviction once enough bytes are freed', () => {
    const index = upsertEntry(
      upsertEntry(emptyOfflineIndex(50), entry('a', 40, 'prefetch', 1)),
      entry('b', 40, 'prefetch', 2),
    )
    expect(selectPrefetchEvictions(index, 10)).toEqual(['a'])
  })
})
