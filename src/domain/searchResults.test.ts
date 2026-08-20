import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '@/src/domain/libraryItem'
import {
  flattenSearchSections,
  groupedSearchCount,
  groupSearchResults,
  searchSections,
} from '@/src/domain/searchResults'

const item = (id: string, type: string, name = id): LibraryItem => ({
  id,
  name,
  type,
  artists: [],
  durationMs: 0,
})

describe('searchResults', () => {
  const items = [
    item('s', 'Audio', 'Song'),
    item('al', 'MusicAlbum', 'Album'),
    item('ar', 'MusicArtist', 'Artist'),
    item('p', 'Playlist', 'List'),
    item('g', 'MusicGenre', 'Jazz'),
  ]

  it('groups known library types and ignores the rest', () => {
    const grouped = groupSearchResults(items)
    expect(grouped.songs.map((row) => row.id)).toEqual(['s'])
    expect(grouped.albums.map((row) => row.id)).toEqual(['al'])
    expect(grouped.artists.map((row) => row.id)).toEqual(['ar'])
    expect(grouped.playlists.map((row) => row.id)).toEqual(['p'])
    expect(groupedSearchCount(grouped)).toBe(4)
  })

  it('builds sections and omits empty groups', () => {
    const titles = {
      songs: 'Songs',
      albums: 'Albums',
      artists: 'Artists',
      playlists: 'Playlists',
    }
    const grouped = groupSearchResults([item('s', 'Audio'), item('p', 'Playlist')])
    expect(searchSections(grouped, 'all', titles).map((section) => section.title)).toEqual([
      'Songs',
      'Playlists',
    ])
    expect(searchSections(grouped, 'songs', titles)).toEqual([
      { title: 'Songs', data: grouped.songs },
    ])
    expect(searchSections(grouped, 'albums', titles)).toEqual([])
  })

  it('flattens sections into list rows', () => {
    const titles = {
      songs: 'Songs',
      albums: 'Albums',
      artists: 'Artists',
      playlists: 'Playlists',
    }
    const grouped = groupSearchResults([item('s', 'Audio'), item('p', 'Playlist')])
    const sections = searchSections(grouped, 'all', titles)
    expect(flattenSearchSections(sections, true).map((row) => row.kind)).toEqual([
      'header',
      'item',
      'header',
      'item',
    ])
    expect(flattenSearchSections(sections, false).map((row) => row.kind)).toEqual([
      'item',
      'item',
    ])
  })
})
