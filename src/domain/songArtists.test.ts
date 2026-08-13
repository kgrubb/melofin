import { describe, expect, it } from 'vitest'
import { backfillSongArtists } from '@/src/domain/songArtists'
import type { LibraryItem } from '@/src/services/jellyfin/mappers'

const song = (
  partial: Partial<LibraryItem> & Pick<LibraryItem, 'id' | 'name'>,
): LibraryItem => ({
  type: 'Audio',
  artists: [],
  durationMs: 1,
  ...partial,
})

describe('backfillSongArtists', () => {
  it('fills empty track artists from the album row', () => {
    const tracks = [
      song({
        id: 'pardon',
        name: 'Pardon Me',
        album: 'Make Yourself',
        imageItemId: 'album-1',
      }),
      song({
        id: 'drive',
        name: 'Drive',
        album: 'Make Yourself',
        artists: ['Incubus'],
      }),
    ]
    const albums = [
      song({
        id: 'album-1',
        name: 'Make Yourself',
        type: 'MusicAlbum',
        artists: ['Incubus'],
        artistId: 'artist-1',
      }),
    ]
    const filled = backfillSongArtists(tracks, albums)
    expect(filled[0]?.artists).toEqual(['Incubus'])
    expect(filled[0]?.albumId).toBe('album-1')
    expect(filled[0]?.artistId).toBe('artist-1')
    expect(filled[1]?.artists).toEqual(['Incubus'])
  })

  it('uses sibling track artists when album metadata is missing', () => {
    const filled = backfillSongArtists([
      song({ id: 'a', name: 'Black Sheep', album: 'Fantasies' }),
      song({
        id: 'b',
        name: 'Sick Muse',
        album: 'Fantasies',
        artists: ['Metric'],
      }),
    ])
    expect(filled[0]?.artists).toEqual(['Metric'])
  })

  it('leaves tracks unchanged when no artist source exists', () => {
    const tracks = [song({ id: 'solo', name: 'Casin' })]
    expect(backfillSongArtists(tracks, [])).toBe(tracks)
  })
})
