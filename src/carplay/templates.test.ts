import { describe, expect, it } from 'vitest'
import {
  buildLibrarySections,
  tracksFromOffline,
} from '@/src/carplay/templates'

describe('carplay templates', () => {
  it('builds sections and offline tracks', () => {
    const sections = buildLibrarySections(
      [
        {
          id: 'p1',
          name: 'Picks',
          type: 'Playlist',
          artists: [],
          durationMs: 0,
          childCount: 4,
        },
        {
          id: 'p2',
          name: 'Empty count',
          type: 'Playlist',
          artists: [],
          durationMs: 0,
        },
      ],
      [{ id: 'a1', name: 'Artist', type: 'MusicArtist', artists: [], durationMs: 0 }],
      [
        {
          itemId: 't1',
          title: 'Song',
          artist: 'A',
          album: 'B',
          durationMs: 1000,
          path: '/x',
          sizeBytes: 1,
          downloadedAt: 1,
          lastAccessedAt: 1,
          kind: 'user',
          complete: true,
        },
      ],
    )
    expect(sections).toHaveLength(3)
    expect(sections[0]?.items[0]?.detailText).toBe('4 tracks')
    expect(sections[0]?.items[1]?.detailText).toBeUndefined()
    expect(
      tracksFromOffline([
        {
          itemId: 't1',
          title: 'Song',
          artist: 'A',
          album: 'B',
          durationMs: 1000,
          path: '/x',
          sizeBytes: 1,
          downloadedAt: 1,
          lastAccessedAt: 1,
          kind: 'user',
          complete: true,
        },
      ])[0]?.title,
    ).toBe('Song')
  })
})
