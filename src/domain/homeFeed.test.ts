import { describe, expect, it } from 'vitest'
import {
  albumCardSubtitle,
  assembleFavoriteArtists,
  assembleInstantMixSeeds,
  assembleMixSeeds,
  collageImageIds,
  downloadsFromOffline,
  HOME_INSTANT_MIX_TARGET,
  HOME_INSTANT_MIX_SEED_ATTEMPTS,
  homeMixCardSubtitle,
  homeMixCardTitle,
  instantMixCardTitle,
  isNumberedMixTitle,
  mixSeedKey,
  primaryArtistName,
  rankArtistsFromTracks,
  recentMixTitle,
  favoritesMixTitle,
  seededMixTitle,
  titleCaseGenreLabel,
  withArtistsFromTracks,
} from '@/src/domain/homeFeed'
import type { LibraryItem } from '@/src/domain/libraryItem'
import type { OfflineEntry } from '@/src/domain/offline'

const item = (
  id: string,
  type = 'Audio',
  extras: Partial<LibraryItem> = {},
): LibraryItem => ({
  id,
  name: id,
  type,
  artists: extras.artists ?? [],
  durationMs: extras.durationMs ?? 1,
  ...extras,
})

const offline = (
  itemId: string,
  complete: boolean,
  lastAccessedAt: number,
): OfflineEntry => ({
  itemId,
  title: itemId,
  artist: 'A',
  album: 'B',
  durationMs: 1000,
  path: `audio/${itemId}`,
  sizeBytes: 10,
  downloadedAt: 1,
  lastAccessedAt,
  kind: 'user',
  complete,
})

describe('homeFeed', () => {
  it('diversifies Instant Mix seeds by artist', () => {
    const seeds = assembleMixSeeds(
      [
        item('xmas1', 'Audio', { artists: ['Bing'], artistId: 'bing' }),
        item('xmas2', 'Audio', { artists: ['Bing'], artistId: 'bing' }),
        item('rock', 'Audio', { artists: ['Radiohead'], artistId: 'rh' }),
        item('album', 'MusicAlbum', { name: 'Kid A' }),
      ],
      3,
    )
    expect(seeds.map((entry) => entry.id)).toEqual(['xmas1', 'rock', 'album'])
    expect(mixSeedKey(item('a', 'Audio', { artistId: 'x' }))).toBe('artist:x')
  })

  it('prefers Audio seeds ahead of albums when assembling mixes', () => {
    const seeds = assembleMixSeeds(
      [
        item('alb', 'MusicAlbum', { name: 'LP' }),
        item('song', 'Audio', { artists: ['A'], artistId: 'a' }),
      ],
      2,
    )
    expect(seeds.map((entry) => entry.id)).toEqual(['song', 'alb'])
  })

  it('builds Instant Mix seeds from ranked artists', () => {
    expect(HOME_INSTANT_MIX_TARGET).toBe(6)
    expect(HOME_INSTANT_MIX_SEED_ATTEMPTS).toBeGreaterThan(HOME_INSTANT_MIX_TARGET)
    const ranked = rankArtistsFromTracks(
      [
        item('1', 'Audio', { artistId: 'a', artists: ['A'] }),
        item('2', 'Audio', { artistId: 'b', artists: ['B'] }),
        item('3', 'Audio', { artistId: 'a', artists: ['A'] }),
      ],
      6,
    )
    const seeds = assembleInstantMixSeeds(
      {
        rankedArtists: ranked,
        recent: [item('1', 'Audio', { artistId: 'a', artists: ['A'] })],
        favorites: [item('2', 'Audio', { artistId: 'b', artists: ['B'] })],
      },
      6,
    )
    expect(seeds.map((entry) => entry.artistId)).toEqual(['a', 'b'])
    expect(
      assembleInstantMixSeeds(
        { rankedArtists: [], recent: [], favorites: [] },
        6,
      ),
    ).toEqual([])
    expect(
      assembleMixSeeds(
        [
          item('s1', 'Audio', { artists: ['A'], artistId: 'a' }),
          item('s2', 'Audio', { artists: ['B'], artistId: 'b' }),
        ],
        6,
      ).map((entry) => entry.id),
    ).toEqual(['s1', 's2'])
  })

  it('rejects numbered Mix N titles', () => {
    expect(seededMixTitle('Tyler, The Creator')).toBe('Tyler, The Creator Mix')
    expect(seededMixTitle('Hip Hop')).toBe('Hip Hop Mix')
    expect(seededMixTitle('Favorites Mix')).toBe('Favorites Mix')
    expect(seededMixTitle('Mix 1')).toBe('')
    expect(seededMixTitle('mix 12')).toBe('')
    expect(isNumberedMixTitle('Mix 3')).toBe(true)
    expect(titleCaseGenreLabel('rock')).toBe('Rock')
    expect(titleCaseGenreLabel('Pop')).toBe('Pop')
    expect(titleCaseGenreLabel('hip-hop')).toBe('Hip-Hop')
    expect(titleCaseGenreLabel('R&B')).toBe('R&B')
    expect(titleCaseGenreLabel("children's music")).toBe("Children's Music")
    expect(titleCaseGenreLabel('drum & bass')).toBe('Drum & Bass')
    expect(titleCaseGenreLabel('folk/rock')).toBe('Folk/Rock')
    expect(
      homeMixCardTitle('Tyler, The Creator', [
        item('1', 'Audio', { artists: ['Tyler, The Creator'] }),
        item('2', 'Audio', { artists: ['Kendrick Lamar'] }),
        item('3', 'Audio', { artists: ['Frank Ocean'] }),
        item('4', 'Audio', { artists: ['SZA'] }),
      ]),
    ).toBe('Tyler, The Creator Mix')
    expect(
      homeMixCardTitle('Mix 1', [
        item('1', 'Audio', { artists: ['Radiohead'] }),
        item('2', 'Audio', { artists: ['Radiohead'] }),
      ]),
    ).toBe('Radiohead Mix')
    expect(
      homeMixCardSubtitle('Tyler, The Creator', [
        item('1', 'Audio', { artists: ['Tyler, The Creator'] }),
        item('2', 'Audio', { artists: ['Kendrick Lamar'] }),
        item('3', 'Audio', { artists: ['Frank Ocean'] }),
        item('4', 'Audio', { artists: ['SZA'] }),
      ]),
    ).toBe('Kendrick Lamar, Frank Ocean, SZA and more')
    expect(homeMixCardSubtitle('Solo', [item('1', 'Audio', { artists: ['Solo'] })])).toBe(
      'Solo',
    )
    expect(homeMixCardTitle('', [])).toBe('Your Mix')
    expect(
      homeMixCardTitle('Mix 2', [
        item('1', 'Audio', { artists: [], genres: ['ambient'] }),
        item('2', 'Audio', { artists: [], genres: ['ambient'] }),
      ]),
    ).toBe('Ambient Mix')
  })

  it('titles Instant Mix cards from the seed', () => {
    expect(instantMixCardTitle(undefined)).toBe('Instant Mix')
    expect(
      instantMixCardTitle(item('s', 'Audio', { artists: ['Radiohead'], name: 'Creep' })),
    ).toBe('Mix · Radiohead')
    expect(instantMixCardTitle(item('Album', 'MusicAlbum'))).toBe('Mix · Album')
    expect(favoritesMixTitle()).toBe('Favorites mix')
    expect(recentMixTitle()).toBe('Recently played')
    expect(
      primaryArtistName(['Tyler, The Creator/Daniel Caesar'], 'x'),
    ).toBe('Tyler, The Creator')
  })

  it('fills empty album artists from matching tracks', () => {
    expect(
      withArtistsFromTracks(
        [
          item('a1', 'MusicAlbum', { artists: [] }),
          item('a2', 'MusicAlbum', { artists: ['Kept'] }),
        ],
        [
          item('t1', 'Audio', { albumId: 'a1', artists: ['From Track'] }),
          item('t2', 'Audio', { albumId: 'a1', artists: ['Ignored'] }),
        ],
      ).map((entry) => entry.artists),
    ).toEqual([['From Track'], ['Kept']])
  })

  it('builds album card subtitles with fallbacks', () => {
    expect(albumCardSubtitle(item('a', 'MusicAlbum', { artists: ['Radiohead'] }))).toBe(
      'Radiohead',
    )
    expect(albumCardSubtitle(item('s', 'Audio', { artists: [], album: 'Kid A' }))).toBe('Kid A')
    expect(albumCardSubtitle(item('a', 'MusicAlbum', { artists: [], childCount: 12 }))).toBe(
      '12 songs',
    )
    expect(albumCardSubtitle(item('a', 'MusicAlbum', { artists: [], childCount: 1 }))).toBe(
      '1 song',
    )
    expect(
      albumCardSubtitle(item('s', 'Audio', { artists: [], dateCreatedMs: Date.UTC(2026, 2, 4) })),
    ).toBe('')
    expect(
      albumCardSubtitle(
        item('a', 'MusicAlbum', { artists: [], dateCreatedMs: Date.UTC(2026, 2, 4) }),
      ),
    ).toMatch(/^Added /)
  })

  it('ranks favorite artists from track frequency', () => {
    const ranked = rankArtistsFromTracks(
      [
        item('1', 'Audio', { artistId: 'a', artists: ['A'] }),
        item('2', 'Audio', { artistId: 'b', artists: ['B'] }),
        item('3', 'Audio', { artistId: 'a', artists: ['A'] }),
        item('4', 'Audio', { artists: ['NoId'] }),
      ],
      12,
    )
    expect(ranked.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(ranked[0]?.type).toBe('MusicArtist')
  })

  it('merges liked artists ahead of ranked', () => {
    const liked = [item('z', 'MusicArtist', { name: 'Z' })]
    const ranked = [
      item('a', 'MusicArtist', { name: 'A' }),
      item('z', 'MusicArtist', { name: 'Zdup' }),
    ]
    expect(assembleFavoriteArtists(liked, ranked, 12).map((e) => e.id)).toEqual([
      'z',
      'a',
    ])
  })

  it('picks distinct collage image ids', () => {
    expect(
      collageImageIds([
        item('t1', 'Audio', { imageItemId: 'alb-a' }),
        item('t2', 'Audio', { imageItemId: 'alb-a' }),
        item('t3', 'Audio', { imageItemId: 'alb-b' }),
      ]),
    ).toEqual(['alb-a', 'alb-b'])
  })

  it('maps complete offline entries newest-first', () => {
    const rail = downloadsFromOffline({
      old: offline('old', true, 1),
      skip: offline('skip', false, 99),
      new: offline('new', true, 50),
    })
    expect(rail.map((entry) => entry.id)).toEqual(['new', 'old'])
  })
})
