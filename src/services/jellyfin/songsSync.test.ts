import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appError, err, ok } from '@/src/domain/result'
import type { LibraryItem } from '@/src/services/jellyfin/library'

vi.mock('@/src/services/jellyfin/library', () => ({
  fetchItemsPage: vi.fn(),
}))

import { fetchItemsPage } from '@/src/services/jellyfin/library'
import { forEachSongPage } from '@/src/services/jellyfin/songsSync'

const fetchMock = vi.mocked(fetchItemsPage)

const song = (id: string): LibraryItem =>
  ({
    id,
    name: id,
    type: 'Audio',
    artists: [],
    durationMs: 1,
  }) as LibraryItem

const page = (ids: string[], total: number) =>
  ok({ items: ids.map(song), total })

const starts = () => fetchMock.mock.calls.map((call) => call[2])

describe('forEachSongPage', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('pairs full pages on wifi then stops at total', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 3))
      .mockResolvedValueOnce(page(['c'], 3))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(3)
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(starts()).toEqual([0, 2])
  })

  it('skips a past-end sibling once total is known', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 5))
      .mockResolvedValueOnce(page(['c', 'd'], 5))
      .mockResolvedValueOnce(page(['e'], 5))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(5)
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(starts()).toEqual([0, 2, 4])
  })

  it('uses the count-probe hint to skip a sibling on the first wave', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 2))
      .mockResolvedValueOnce(page([], 2))

    const seen: string[] = []
    await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
      2,
    )

    expect(seen).toEqual(['a', 'b'])
    expect(starts()).toEqual([0, 2])
  })

  it('ignores sibling failure when the first page already finished the catalog', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 2))
      .mockResolvedValueOnce(err(appError('network', 'boom')))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    expect(seen).toEqual(['a', 'b'])
  })

  it('falls back to sequential then re-pairs after a full page', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 8))
      .mockResolvedValueOnce(err(appError('network', 'boom')))
      .mockResolvedValueOnce(page(['c', 'd'], 8))
      .mockResolvedValueOnce(page(['e', 'f'], 8))
      .mockResolvedValueOnce(page(['g', 'h'], 8))
      .mockResolvedValueOnce(page([], 8))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    expect(starts()).toEqual([0, 2, 2, 4, 6, 8])
  })

  it('does not treat an empty sibling as a finished catalog', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 4))
      .mockResolvedValueOnce(page([], 4))
      .mockResolvedValueOnce(page(['c', 'd'], 4))
      .mockResolvedValueOnce(page([], 4))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    expect(seen).toEqual(['a', 'b', 'c', 'd'])
  })

  it('updates known total from the sibling page so pair paging cannot truncate', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 3))
      .mockResolvedValueOnce(page(['c', 'd'], 6))
      .mockResolvedValueOnce(page(['e', 'f'], 6))
      .mockResolvedValueOnce(page([], 6))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(6)
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(starts()).toEqual([0, 2, 4, 6])
  })

  it('keeps a sibling page when the first total falsely says done', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 2))
      .mockResolvedValueOnce(page(['c', 'd'], 4))
      .mockResolvedValueOnce(page([], 4))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(4)
    expect(seen).toEqual(['a', 'b', 'c', 'd'])
  })

  it('continues when a full sibling still reports an undercounted total', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 3))
      .mockResolvedValueOnce(page(['c', 'd'], 3))
      .mockResolvedValueOnce(page(['e', 'f'], 6))
      .mockResolvedValueOnce(page([], 6))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(6)
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(starts()).toEqual([0, 2, 4, 6])
  })

  it('passes accumulated then total to onPage (SongPageSink order)', async () => {
    fetchMock.mockResolvedValueOnce(page(['a'], 1))

    const calls: Array<{ accumulated: number; total: number }> = []
    await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 1 },
      async (_items, accumulated, total) => {
        calls.push({ accumulated, total })
      },
    )

    expect(calls).toEqual([{ accumulated: 1, total: 1 }])
  })

  it('does not treat a zero total as done after a failed sibling', async () => {
    fetchMock
      .mockResolvedValueOnce(page(['a', 'b'], 0))
      .mockResolvedValueOnce(err(appError('network', 'boom')))
      .mockResolvedValueOnce(page(['c', 'd'], 4))
      .mockResolvedValueOnce(page([], 4))

    const seen: string[] = []
    const result = await forEachSongPage(
      {} as never,
      'u1',
      { pageSize: 2, concurrency: 2 },
      async (items) => {
        for (const item of items) seen.push(item.id)
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(4)
    expect(seen).toEqual(['a', 'b', 'c', 'd'])
  })
})
