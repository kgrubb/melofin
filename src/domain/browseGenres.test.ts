import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '@/src/domain/libraryItem'
import {
  BROWSE_GENRES_DISPLAY_LIMIT,
  browseGenreAlbumCount,
  genreTileCovers,
  sampleBrowseGenres,
  sampleBrowseGenresStable,
  type BrowseGenre,
} from '@/src/domain/browseGenres'

const genre = (id: string): LibraryItem => ({
  id,
  name: id,
  type: 'MusicGenre',
  artists: [],
  durationMs: 0,
})

const sequence = (values: readonly number[]): (() => number) => {
  const cursor = { index: 0 }
  return () => {
    const value = values[cursor.index % values.length] ?? 0
    cursor.index += 1
    return value
  }
}

const browseEntry = (id: string): BrowseGenre => ({
  genre: genre(id),
  sampleAlbums: [],
})

describe('sampleBrowseGenres', () => {
  it('returns empty when there is nothing to show', () => {
    expect(sampleBrowseGenres([])).toEqual([])
    expect(sampleBrowseGenres([browseEntry('a')], 0)).toEqual([])
    expect(
      sampleBrowseGenres([browseEntry('a'), browseEntry('b')]).map((row) => row.genre.id),
    ).toEqual(['a', 'b'])
  })

  it('shuffles and caps the browse grid', () => {
    const pool = Array.from({ length: 12 }, (_, i) => browseEntry(`g${i}`))
    const rows = sampleBrowseGenres(
      pool,
      BROWSE_GENRES_DISPLAY_LIMIT,
      sequence([0.1, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.5]),
    )
    expect(rows).toHaveLength(BROWSE_GENRES_DISPLAY_LIMIT)
    expect(new Set(rows.map((row) => row.genre.id)).size).toBe(BROWSE_GENRES_DISPLAY_LIMIT)
  })

  it('picks the same tiles for the same ids regardless of input order', () => {
    const pool = Array.from({ length: 12 }, (_, i) => browseEntry(`g${i}`))
    const forward = sampleBrowseGenresStable(pool)
    const reverse = sampleBrowseGenresStable([...pool].reverse())
    expect(forward.map((row) => row.genre.id)).toEqual(reverse.map((row) => row.genre.id))
    expect(forward).toHaveLength(BROWSE_GENRES_DISPLAY_LIMIT)
  })
})

describe('genreTileCovers', () => {
  it('uses a single cover unless two unique arts are available', () => {
    const album = (id: string, tag: string): LibraryItem => ({
      id,
      name: id,
      type: 'MusicAlbum',
      artists: ['A'],
      durationMs: 0,
      imageTag: tag,
    })
    expect(genreTileCovers([album('a', 'ta')]).map((row) => row.id)).toEqual(['a'])
    expect(genreTileCovers([album('a', 'ta'), album('b', 'tb')]).map((row) => row.id)).toEqual([
      'a',
      'b',
    ])
    expect(
      genreTileCovers([
        album('a', 'ta'),
        album('b', 'tb'),
        album('c', 'tc'),
        album('d', 'td'),
      ]).map((row) => row.id),
    ).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('browseGenreAlbumCount', () => {
  it('uses the larger of total and page size', () => {
    expect(browseGenreAlbumCount(12, 3)).toBe(12)
    expect(browseGenreAlbumCount(0, 3)).toBe(3)
    expect(browseGenreAlbumCount(undefined, 1)).toBe(1)
  })
})
