import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '@/src/domain/libraryItem'
import {
  assembleExplorePlaylists,
  EXPLORE_PLAYLISTS_LIMIT,
} from '@/src/domain/explorePlaylists'

const mix = (id: string) => ({
  id,
  title: id,
  subtitle: 'Made for you',
  tracks: [] as const,
})

const playlist = (id: string): LibraryItem => ({
  id,
  name: id,
  type: 'Playlist',
  artists: [],
  durationMs: 0,
})

describe('assembleExplorePlaylists', () => {
  it('returns empty when there is nothing to show', () => {
    expect(assembleExplorePlaylists([], [])).toEqual([])
    expect(assembleExplorePlaylists([mix('a')], [playlist('p')], 0)).toEqual([])
    expect(assembleExplorePlaylists([mix('a'), mix('b')], [playlist('p')])).toEqual([
      { kind: 'mix', mix: mix('a') },
      { kind: 'mix', mix: mix('b') },
      { kind: 'playlist', playlist: playlist('p') },
    ])
  })

  it('uses only mixes or only playlists when the other pool is empty', () => {
    expect(assembleExplorePlaylists([mix('a'), mix('b'), mix('c')], [], 2)).toEqual([
      { kind: 'mix', mix: mix('a') },
      { kind: 'mix', mix: mix('b') },
    ])
    expect(assembleExplorePlaylists([], [playlist('p'), playlist('q')], 2)).toEqual([
      { kind: 'playlist', playlist: playlist('p') },
      { kind: 'playlist', playlist: playlist('q') },
    ])
  })

  it('blends both sources and respects the cap', () => {
    const rows = assembleExplorePlaylists(
      [mix('m1'), mix('m2'), mix('m3'), mix('m4')],
      [playlist('p1'), playlist('p2'), playlist('p3')],
      5,
    )
    expect(rows).toEqual([
      { kind: 'mix', mix: mix('m1') },
      { kind: 'mix', mix: mix('m2') },
      { kind: 'mix', mix: mix('m3') },
      { kind: 'playlist', playlist: playlist('p1') },
      { kind: 'playlist', playlist: playlist('p2') },
    ])
  })

  it('defaults to the explore cap', () => {
    const mixes = Array.from({ length: 12 }, (_, i) => mix(`m${i}`))
    expect(assembleExplorePlaylists(mixes, [])).toHaveLength(EXPLORE_PLAYLISTS_LIMIT)
  })
})
