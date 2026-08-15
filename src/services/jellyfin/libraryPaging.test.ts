import { describe, expect, it } from 'vitest'
import {
  dedupeLibraryItems,
  dedupePlaylistTracks,
  GENRE_TRACK_PAGE_SIZE,
  LIBRARY_PAGE_SIZE,
  shouldFetchNextPage,
} from '@/src/services/jellyfin/libraryPaging'

describe('libraryPaging', () => {
  it('continues while a full page arrives or items remain before total', () => {
    expect(shouldFetchNextPage(0, LIBRARY_PAGE_SIZE, 450)).toBe(true)
    expect(shouldFetchNextPage(200, LIBRARY_PAGE_SIZE, 450)).toBe(true)
    expect(shouldFetchNextPage(400, 50, 450)).toBe(false)
    expect(shouldFetchNextPage(0, 0, 100)).toBe(false)
    // Full page at exact total: keep going until a short/empty page.
    expect(shouldFetchNextPage(0, LIBRARY_PAGE_SIZE, LIBRARY_PAGE_SIZE)).toBe(
      true,
    )
    // Short page under total (server capped the Limit).
    expect(shouldFetchNextPage(0, 100, 450)).toBe(true)
    expect(shouldFetchNextPage(100, 100, 450)).toBe(true)
    expect(shouldFetchNextPage(400, 50, 450)).toBe(false)
    expect(shouldFetchNextPage(0, 50, 50)).toBe(false)
    expect(shouldFetchNextPage(0, GENRE_TRACK_PAGE_SIZE, 1200, GENRE_TRACK_PAGE_SIZE)).toBe(
      true,
    )
    expect(
      shouldFetchNextPage(500, 200, 700, GENRE_TRACK_PAGE_SIZE),
    ).toBe(false)
  })

  it('dedupes by id and drops empty ids', () => {
    expect(
      dedupeLibraryItems([
        { id: 'a', name: '1' },
        { id: 'b', name: '2' },
        { id: 'a', name: 'dup' },
        { id: '', name: 'bad' },
      ]),
    ).toEqual([
      { id: 'a', name: '1' },
      { id: 'b', name: '2' },
    ])
  })

  it('dedupes playlist tracks by entry id', () => {
    expect(
      dedupePlaylistTracks([
        { id: 'song', playlistEntryId: 'e1' },
        { id: 'song', playlistEntryId: 'e2' },
        { id: 'song', playlistEntryId: 'e1' },
        { id: 'other' },
        { id: 'other' },
        { id: '' },
      ]),
    ).toEqual([
      { id: 'song', playlistEntryId: 'e1' },
      { id: 'song', playlistEntryId: 'e2' },
      { id: 'other' },
    ])
  })
})
