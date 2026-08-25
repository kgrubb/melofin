import { describe, expect, it, vi } from 'vitest'
import {
  homeRailsHasContent,
  loadPersistedHomeRails,
  persistHomeRails,
  emptyHomeRails,
} from '@/src/store/homeRails'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

vi.mock('@/src/storage/jsonFile', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}))

const readJsonFileMock = vi.mocked(readJsonFile)
const writeJsonFileMock = vi.mocked(writeJsonFile)

describe('homeRails', () => {
  it('reports empty snapshots', () => {
    expect(homeRailsHasContent(emptyHomeRails())).toBe(false)
    expect(
      homeRailsHasContent({
        ...emptyHomeRails(),
        albums: [{ id: 'a', name: 'A', type: 'MusicAlbum', artists: [], durationMs: 0 }],
      }),
    ).toBe(true)
  })

  it('loads and filters persisted rails', async () => {
    readJsonFileMock.mockResolvedValueOnce({
      ok: true,
      value: {
        albums: [
          { id: 'a1', name: 'Album', type: 'MusicAlbum', artists: ['X'], durationMs: 0 },
          { id: '', name: 'bad', type: 'MusicAlbum', artists: [] },
        ],
        resume: [{ id: 'r1', name: 'Song', type: 'Audio', artists: ['Y'], durationMs: 1 }],
        playlists: 'nope',
        favorites: null,
        favoriteArtists: [
          { id: 'ar1', name: 'Artist', type: 'MusicArtist', artists: [], durationMs: 0 },
        ],
        genres: [{ id: 'g1', name: 'Rock', type: 'MusicGenre', artists: [], durationMs: 0 }],
        savedAt: 42,
      },
    } as never)

    const loaded = await loadPersistedHomeRails('https://jf', 'u1')
    expect(loaded.albums.map((row) => row.id)).toEqual(['a1'])
    expect(loaded.resume.map((row) => row.id)).toEqual(['r1'])
    expect(loaded.playlists).toEqual([])
    expect(loaded.favorites).toEqual([])
    expect(loaded.favoriteArtists.map((row) => row.id)).toEqual(['ar1'])
    expect(loaded.genres.map((row) => row.id)).toEqual(['g1'])
    expect(loaded.savedAt).toBe(42)
  })

  it('persists a rails snapshot', async () => {
    writeJsonFileMock.mockResolvedValueOnce({ ok: true, value: undefined } as never)
    await persistHomeRails('https://jf', 'u1', {
      ...emptyHomeRails(),
      savedAt: 99,
    })
    expect(writeJsonFileMock).toHaveBeenCalledWith(
      expect.stringContaining('home-rails-'),
      expect.objectContaining({ savedAt: 99 }),
    )
  })
})
