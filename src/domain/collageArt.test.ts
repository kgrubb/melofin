import { describe, expect, it } from 'vitest'
import { uniqueCollageItems } from '@/src/domain/collageArt'
import type { LibraryItem } from '@/src/domain/libraryItem'

const item = (id: string, patch: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  name: id,
  type: 'MusicAlbum',
  artists: ['A'],
  durationMs: 0,
  ...patch,
})

describe('uniqueCollageItems', () => {
  it('skips shared covers and still fills later unique art', () => {
    const rows = uniqueCollageItems([
      item('deluxe', { imageTag: 'cover-a', albumId: 'a' }),
      item('remaster', { imageTag: 'cover-a', albumId: 'a-re' }),
      item('same-album-track', { type: 'Audio', imageTag: 'other', albumId: 'a' }),
      item('b', { imageTag: 'cover-b', albumId: 'b' }),
      item('c', { imageTag: 'cover-c', albumId: 'c' }),
      item('d', { imageTag: 'cover-d', albumId: 'd' }),
    ])
    expect(rows.map((row) => row.id)).toEqual(['deluxe', 'b', 'c', 'd'])
  })

  it('fills a short mix from later unique albums', () => {
    const rows = uniqueCollageItems([
      item('mix-track', { type: 'Audio', imageTag: 'cover-a', albumId: 'a' }),
      item('b', { imageTag: 'cover-b' }),
      item('c', { imageTag: 'cover-c' }),
      item('d', { imageTag: 'cover-d' }),
    ])
    expect(rows.map((row) => row.id)).toEqual(['b', 'c', 'd', 'mix-track'])
  })

  it('skips covers already used by another mix', () => {
    const rows = uniqueCollageItems(
      [
        item('a', { imageTag: 'cover-a', albumId: 'a' }),
        item('b', { imageTag: 'cover-b', albumId: 'b' }),
        item('c', { imageTag: 'cover-c', albumId: 'c' }),
      ],
      4,
      new Set(['tag:cover-a', 'album:a']),
    )
    expect(rows.map((row) => row.id)).toEqual(['b', 'c'])
  })

  it('fills tagged album covers before untagged or track placeholders', () => {
    const rows = uniqueCollageItems([
      item('track', { type: 'Audio', imageTag: 'track-tag', albumId: 'z' }),
      item('empty'),
      item('b', { imageTag: 'cover-b', albumId: 'b' }),
      item('c', { imageTag: 'cover-c', albumId: 'c' }),
    ])
    expect(rows.map((row) => row.id)).toEqual(['b', 'c', 'empty', 'track'])
  })
})
