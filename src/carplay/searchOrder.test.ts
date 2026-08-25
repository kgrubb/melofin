import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '@/src/services/jellyfin/library'
import { orderSearchResults } from '@/src/carplay/searchOrder'

const item = (
  id: string,
  type: LibraryItem['type'],
  name = id,
): LibraryItem => ({
  id,
  name,
  type,
  artists: [],
  durationMs: 0,
})

describe('carplay search order', () => {
  it('orders songs before albums, playlists, then artists', () => {
    const ordered = orderSearchResults([
      item('ar', 'MusicArtist'),
      item('pl', 'Playlist'),
      item('al', 'MusicAlbum'),
      item('sg', 'Audio'),
      item('sg2', 'Audio'),
    ])
    expect(ordered.map((entry) => entry.id)).toEqual([
      'sg',
      'sg2',
      'al',
      'pl',
      'ar',
    ])
  })
})
