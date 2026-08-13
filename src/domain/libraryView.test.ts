import { describe, expect, it } from 'vitest'
import {
  applyLibraryView,
  isLibraryFilter,
  isLibrarySort,
  libraryFilterLabel,
  librarySortLabel,
  type LibraryViewItem,
} from '@/src/domain/libraryView'

const item = (
  partial: Partial<LibraryViewItem> & Pick<LibraryViewItem, 'id' | 'name'>,
): LibraryViewItem => ({
  ...partial,
})

describe('libraryView', () => {
  it('filters favorites and unplayed then sorts', () => {
    const items = [
      item({ id: '1', name: 'B', isFavorite: true, isPlayed: true, dateCreatedMs: 1 }),
      item({ id: '2', name: 'A', isFavorite: false, isPlayed: false, dateCreatedMs: 3 }),
      item({ id: '3', name: 'C', isFavorite: true, isPlayed: false, dateCreatedMs: 2 }),
    ]
    expect(applyLibraryView(items, 'name', 'favorites').map((i) => i.id)).toEqual([
      '1',
      '3',
    ])
    expect(applyLibraryView(items, 'dateAdded', 'unplayed').map((i) => i.id)).toEqual([
      '2',
      '3',
    ])
    expect(applyLibraryView(items, 'recentlyPlayed', 'all').map((i) => i.id)).toEqual([
      '2',
      '1',
      '3',
    ])
  })

  it('sorts by recently played when timestamps differ', () => {
    const items = [
      item({ id: '1', name: 'A', lastPlayedMs: 10 }),
      item({ id: '2', name: 'B', lastPlayedMs: 50 }),
      item({ id: '3', name: 'C' }),
    ]
    expect(applyLibraryView(items, 'recentlyPlayed', 'all').map((i) => i.id)).toEqual([
      '2',
      '1',
      '3',
    ])
  })

  it('labels and guards', () => {
    expect(librarySortLabel('name')).toBe('Name')
    expect(librarySortLabel('dateAdded')).toBe('Date added')
    expect(librarySortLabel('recentlyPlayed')).toBe('Recently played')
    expect(libraryFilterLabel('all')).toBe('All')
    expect(libraryFilterLabel('favorites')).toBe('Favorites')
    expect(libraryFilterLabel('unplayed')).toBe('Unplayed')
    expect(isLibrarySort('name')).toBe(true)
    expect(isLibrarySort('x')).toBe(false)
    expect(isLibraryFilter('all')).toBe(true)
    expect(isLibraryFilter('x')).toBe(false)
  })
})
