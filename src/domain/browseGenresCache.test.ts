import { describe, expect, it } from 'vitest'
import {
  BROWSE_GENRES_CACHE_MAX_AGE_MS,
  BROWSE_GENRES_CACHE_VERSION,
  isBrowseGenresCacheFresh,
  parseBrowseGenresCache,
  serializeBrowseGenresCache,
  shouldRefreshBrowseGenres,
} from '@/src/domain/browseGenresCache'

describe('parseBrowseGenresCache', () => {
  it('drops invalid rows and keeps genre artwork samples', () => {
    const parsed = parseBrowseGenresCache({
      savedAt: 100,
      version: BROWSE_GENRES_CACHE_VERSION,
      genres: [
        {
          id: 'g1',
          name: 'Rock',
          type: 'MusicGenre',
          artists: [],
          durationMs: 0,
          imageTag: 'tag',
          imageItemId: 'g1',
          sampleAlbums: [
            { id: 'a1', imageTag: 't1', imageItemId: 'a1' },
            { id: 'a2', imageTag: 't2', imageItemId: 'a2' },
          ],
        },
        { id: '', name: 'Bad' },
        null,
      ],
    })
    expect(parsed.savedAt).toBe(100)
    expect(parsed.version).toBe(BROWSE_GENRES_CACHE_VERSION)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]?.genre.id).toBe('g1')
    expect(parsed.items[0]?.sampleAlbums.map((album) => album.id)).toEqual(['a1', 'a2'])
    expect(parseBrowseGenresCache(serializeBrowseGenresCache(parsed.items, 100))).toEqual({
      items: parsed.items,
      savedAt: 100,
      version: BROWSE_GENRES_CACHE_VERSION,
    })
  })
})

describe('isBrowseGenresCacheFresh', () => {
  it('treats cache as fresh only within a day', () => {
    const now = 1_700_000_000_000
    expect(isBrowseGenresCacheFresh(undefined, now)).toBe(false)
    expect(isBrowseGenresCacheFresh(now, now)).toBe(true)
    expect(isBrowseGenresCacheFresh(now - BROWSE_GENRES_CACHE_MAX_AGE_MS + 1, now)).toBe(true)
    expect(isBrowseGenresCacheFresh(now - BROWSE_GENRES_CACHE_MAX_AGE_MS, now)).toBe(false)
  })
})

describe('shouldRefreshBrowseGenres', () => {
  it('refreshes empty, stale, or version-mismatched caches', () => {
    const now = 1_700_000_000_000
    const entry = {
      genre: { id: 'g', name: 'Rock', type: 'MusicGenre', artists: [], durationMs: 0 },
      sampleAlbums: [],
    }
    expect(
      shouldRefreshBrowseGenres({ items: [], savedAt: now, version: BROWSE_GENRES_CACHE_VERSION }, now),
    ).toBe(true)
    expect(
      shouldRefreshBrowseGenres(
        { items: [entry], savedAt: now, version: BROWSE_GENRES_CACHE_VERSION },
        now,
      ),
    ).toBe(false)
    expect(
      shouldRefreshBrowseGenres(
        {
          items: [entry],
          savedAt: now - BROWSE_GENRES_CACHE_MAX_AGE_MS,
          version: BROWSE_GENRES_CACHE_VERSION,
        },
        now,
      ),
    ).toBe(true)
    expect(
      shouldRefreshBrowseGenres(
        { items: [entry], savedAt: now, version: BROWSE_GENRES_CACHE_VERSION - 1 },
        now,
      ),
    ).toBe(true)
  })
})
