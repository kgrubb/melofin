import { describe, expect, it } from 'vitest'
import {
  dedupeLibraryItems,
  LIBRARY_PAGE_SIZE,
  shouldFetchNextPage,
} from '@/src/services/jellyfin/libraryPaging'

describe('libraryPaging', () => {
  it('continues while a full page remains before total', () => {
    expect(shouldFetchNextPage(0, LIBRARY_PAGE_SIZE, 450)).toBe(true)
    expect(shouldFetchNextPage(200, LIBRARY_PAGE_SIZE, 450)).toBe(true)
    expect(shouldFetchNextPage(400, 50, 450)).toBe(false)
    expect(shouldFetchNextPage(0, 0, 100)).toBe(false)
    expect(shouldFetchNextPage(0, LIBRARY_PAGE_SIZE, LIBRARY_PAGE_SIZE)).toBe(false)
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
})
