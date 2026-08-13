import { describe, expect, it } from 'vitest'
import {
  assembleListenNow,
  isListenNowTrack,
  listenNowSeed,
} from '@/src/domain/listenNow'
import type { LibraryItem } from '@/src/services/jellyfin/mappers'

const item = (
  id: string,
  type = 'Audio',
): LibraryItem => ({
  id,
  name: id,
  type,
  artists: [],
  durationMs: 1,
})

describe('listenNow', () => {
  it('prefers an Audio resume seed', () => {
    expect(
      listenNowSeed(
        [item('album', 'MusicAlbum'), item('song')],
        [item('latest', 'MusicAlbum')],
        [],
      )?.id,
    ).toBe('song')
  })

  it('falls back to album then playlist', () => {
    expect(listenNowSeed([], [item('a', 'MusicAlbum')], [])?.id).toBe('a')
    expect(listenNowSeed([], [], [item('p', 'Playlist')])?.id).toBe('p')
  })

  it('keeps Audio tracks and pads from later sources', () => {
    expect(
      assembleListenNow(
        [
          [item('seed'), item('album', 'MusicAlbum')],
          [item('seed'), item('b'), item('c')],
        ],
        8,
      ).map((entry) => entry.id),
    ).toEqual(['seed', 'b', 'c'])
  })

  it('rejects empty ids and non-audio', () => {
    expect(isListenNowTrack(item('', 'Audio'))).toBe(false)
    expect(isListenNowTrack(item('x', 'MusicAlbum'))).toBe(false)
  })
})
