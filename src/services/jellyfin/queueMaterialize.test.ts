import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '@/src/services/jellyfin/mappers'
import { materializeQueueTracks, materializeQueueTracksFromPages } from '@/src/services/jellyfin/queueMaterialize'

const item = (id: string): LibraryItem => ({
  id,
  name: `Song ${id}`,
  type: 'Audio',
  artists: ['A'],
  durationMs: 1000,
})

describe('materializeQueueTracks', () => {
  it('maps all items across chunks without blocking one tick', async () => {
    const items = Array.from({ length: 5 }, (_, i) => item(String(i)))
    const chunks: number[] = []
    const schedule = (next: () => void) => {
      queueMicrotask(next)
    }
    const tracks = await materializeQueueTracks(items, () => undefined, {
      chunkSize: 2,
      schedule,
      onChunk: (partial) => chunks.push(partial.length),
    })
    expect(tracks).toHaveLength(5)
    expect(tracks.map((t) => t.id)).toEqual(['0', '1', '2', '3', '4'])
    expect(chunks).toEqual([2, 4, 5])
  })

  it('applies artwork resolver per item', async () => {
    const tracks = await materializeQueueTracks([item('a')], (row) => `art:${row.id}`, {
      schedule: (next) => next(),
    })
    expect(tracks[0]?.artworkUrl).toBe('art:a')
  })

  it('reports growing lengths to onChunk', async () => {
    const items = Array.from({ length: 4 }, (_, i) => item(String(i)))
    const lengths: number[] = []
    await materializeQueueTracks(items, () => undefined, {
      chunkSize: 2,
      schedule: (next) => queueMicrotask(next),
      onChunk: (partial) => {
        lengths.push(partial.length)
      },
    })
    expect(lengths).toEqual([2, 4])
  })
})

describe('materializeQueueTracksFromPages', () => {
  it('pages until exhausted', async () => {
    const all = Array.from({ length: 5 }, (_, i) => item(String(i)))
    const loadPage = async (
      cursor: { sortName: string; id: string } | null,
      limit: number,
    ) => {
      const start = cursor
        ? all.findIndex((row) => row.id === cursor.id) + 1
        : 0
      return all.slice(Math.max(0, start), Math.max(0, start) + limit)
    }
    const tracks = await materializeQueueTracksFromPages(loadPage, () => undefined, {
      pageSize: 2,
      schedule: (next) => queueMicrotask(next),
    })
    expect(tracks.map((t) => t.id)).toEqual(['0', '1', '2', '3', '4'])
  })
})
