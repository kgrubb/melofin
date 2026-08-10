import { describe, expect, it } from 'vitest'
import {
  normalizePlaylistName,
  patchPlaylistChildCount,
  playlistStub,
  removePlaylistItem,
  upsertPlaylistItem,
  validatePlaylistName,
  type PlaylistCacheEntry,
} from '@/src/domain/playlists'

const entry = (
  overrides: Partial<PlaylistCacheEntry> & Pick<PlaylistCacheEntry, 'id' | 'name'>,
): PlaylistCacheEntry => ({
  type: 'Playlist',
  artists: [],
  durationMs: 0,
  ...overrides,
})

describe('playlists domain', () => {
  it('normalizes playlist names', () => {
    expect(normalizePlaylistName('  Late   Night  ')).toBe('Late Night')
    expect(normalizePlaylistName('\tMix\n')).toBe('Mix')
  })

  it('validates playlist names', () => {
    const named = validatePlaylistName('  Road Trip ')
    expect(named.ok).toBe(true)
    if (named.ok) expect(named.value).toBe('Road Trip')
    const empty = validatePlaylistName('   ')
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.error.code).toBe('validation')
  })

  it('upserts playlist cache entries', () => {
    const a = entry({ id: 'a', name: 'A', childCount: 1 })
    const b = entry({ id: 'b', name: 'B' })
    expect(upsertPlaylistItem([], a)).toEqual([a])
    expect(upsertPlaylistItem([a], b)).toEqual([b, a])
    const renamed = entry({ id: 'a', name: 'A2', childCount: 2 })
    expect(upsertPlaylistItem([a, b], renamed)).toEqual([renamed, b])
  })

  it('removes playlist cache entries', () => {
    const a = entry({ id: 'a', name: 'A' })
    const b = entry({ id: 'b', name: 'B' })
    expect(removePlaylistItem([a, b], 'a')).toEqual([b])
    expect(removePlaylistItem([a, b], 'missing')).toEqual([a, b])
  })

  it('patches playlist child counts', () => {
    const a = entry({ id: 'a', name: 'A', childCount: 1 })
    const b = entry({ id: 'b', name: 'B' })
    expect(patchPlaylistChildCount([a, b], 'a', 5)).toEqual([
      entry({ id: 'a', name: 'A', childCount: 5 }),
      b,
    ])
    expect(patchPlaylistChildCount([a, b], 'missing', 9)).toEqual([a, b])
  })

  it('builds playlist stubs', () => {
    expect(playlistStub('p1', '  Mix  ', 3)).toEqual({
      id: 'p1',
      name: 'Mix',
      type: 'Playlist',
      artists: [],
      durationMs: 0,
      childCount: 3,
    })
  })
})
