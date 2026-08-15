import { describe, expect, it } from 'vitest'
import {
  diversifyMixTracks,
  enrichSeedGenres,
  excludeTrackIds,
  filterInstantMixTracks,
  foldGenreCatalog,
  genreFitScore,
  genresOverlap,
  GENRE_FIT_MIN,
  GENRE_FIT_NEUTRAL,
  listeningGenreNames,
  listeningGenresFromTracks,
  listeningGenresNeedCatalog,
  mixTitleKey,
  needsMixDiversityPad,
  normalizeGenre,
  preferListeningGenres,
  themedMixTracks,
} from '@/src/domain/instantMix'
import type { LibraryItem } from '@/src/domain/libraryItem'

const item = (
  id: string,
  extras: Partial<LibraryItem> = {},
): LibraryItem => ({
  id,
  name: id,
  type: 'Audio',
  artists: extras.artists ?? [],
  durationMs: extras.durationMs ?? 1,
  ...extras,
})

describe('instantMix', () => {
  it('scores genre fit with Jaccard/recall; missing tags are soft-neutral', () => {
    expect(normalizeGenre('Hip-Hop')).toBe('hiphop')
    expect(genresOverlap(['Hip Hop'], ['hip-hop', 'Electronic'])).toBe(true)
    expect(genresOverlap(['Rap'], ['Indie Rock'])).toBe(false)
    expect(genreFitScore(['Psychedelic Rock'], ['Psychedelic Rock', 'Indie'])).toBeGreaterThan(
      GENRE_FIT_MIN,
    )
    expect(genreFitScore(['Psychedelic Rock'], ['Hip Hop'])).toBe(0)
    expect(genreFitScore(['Psychedelic Rock'], [])).toBe(GENRE_FIT_NEUTRAL)
    expect(genreFitScore([], ['Hip Hop'])).toBe(GENRE_FIT_NEUTRAL)
    expect(GENRE_FIT_NEUTRAL).toBeLessThan(GENRE_FIT_MIN)
  })

  it('keeps genre-fitting Instant Mix neighbors; drops low-fit noise', () => {
    const seed = item('tyler-seed', {
      artists: ['Tyler, The Creator'],
      artistId: 'tyler',
      genres: ['Hip Hop', 'Rap'],
    })
    const filtered = filterInstantMixTracks(seed, [
      item('t1', { artists: ['Tyler, The Creator'], artistId: 'tyler', genres: ['Rap'] }),
      item('odesza', {
        artists: ['Odesza'],
        artistId: 'odesza',
        genres: ['Electronic'],
      }),
      item('relient', {
        artists: ['Relient K'],
        artistId: 'rk',
        genres: ['Christian Rock'],
      }),
      item('kendrick', {
        artists: ['Kendrick Lamar'],
        artistId: 'kdot',
        genres: ['Hip-Hop'],
      }),
      item('jim', {
        artists: ['Jim-E Stack'],
        artistId: 'jim',
        genres: ['Electronic'],
      }),
    ])
    expect(filtered.map((entry) => entry.id)).toEqual(['t1', 'kendrick'])
  })

  it('without seed genres, drops neighbors that only score soft-neutral', () => {
    const seed = item('seed', {
      artists: ['Tyler, The Creator'],
      artistId: 'tyler',
    })
    const filtered = filterInstantMixTracks(seed, [
      item('t1', { artists: ['Tyler, The Creator'], artistId: 'tyler' }),
      item('odesza', { artists: ['Odesza'], artistId: 'odesza', genres: ['Electronic'] }),
    ])
    expect(filtered.map((entry) => entry.id)).toEqual(['t1'])
  })

  it('borrows genres from same-artist mix rows when seed is untagged', () => {
    const seed = item('seed', {
      artists: ['Tyler, The Creator'],
      artistId: 'tyler',
    })
    const mix = [
      item('t1', {
        artists: ['Tyler, The Creator'],
        artistId: 'tyler',
        genres: ['Rap'],
      }),
      item('kdot', {
        artists: ['Kendrick Lamar'],
        artistId: 'kdot',
        genres: ['Hip Hop'],
      }),
      item('odesza', {
        artists: ['Odesza'],
        artistId: 'odesza',
        genres: ['Electronic'],
      }),
    ]
    expect(enrichSeedGenres(seed, mix)).toEqual(['Rap'])
    expect(filterInstantMixTracks(seed, mix).map((entry) => entry.id)).toEqual([
      't1',
      'kdot',
    ])
  })

  it('ignores one-off seed-artist tags when enriching genres', () => {
    const seed = item('seed', {
      artists: ['Tyler, The Creator'],
      artistId: 'tyler',
    })
    const mix = [
      item('t1', {
        artists: ['Tyler, The Creator'],
        artistId: 'tyler',
        genres: ['Rap'],
      }),
      item('t2', {
        artists: ['Tyler, The Creator'],
        artistId: 'tyler',
        genres: ['Hip Hop'],
      }),
      item('t3', {
        artists: ['Tyler, The Creator'],
        artistId: 'tyler',
        genres: ['Rap'],
      }),
      item('txmas', {
        artists: ['Tyler, The Creator'],
        artistId: 'tyler',
        genres: ['Christmas'],
      }),
      item('mariah', {
        artists: ['Mariah Carey'],
        artistId: 'mariah',
        genres: ['Christmas'],
      }),
      item('kdot', {
        artists: ['Kendrick Lamar'],
        artistId: 'kdot',
        genres: ['Hip Hop'],
      }),
    ]
    expect(enrichSeedGenres(seed, mix)).toEqual(['Rap'])
    expect(filterInstantMixTracks(seed, mix).map((entry) => entry.id)).toEqual([
      't1',
      't2',
      't3',
      'txmas',
      'kdot',
    ])
  })

  it('uses only the primary tag when a single seed-artist row has many genres', () => {
    const seed = item('seed', {
      artists: ['Tyler, The Creator'],
      artistId: 'tyler',
    })
    expect(
      enrichSeedGenres(seed, [
        item('t1', {
          artists: ['Tyler, The Creator'],
          artistId: 'tyler',
          genres: ['Rap', 'Christmas', 'Jazz'],
        }),
      ]),
    ).toEqual(['Rap'])
  })

  it('prefers listening genres and excludes used track ids', () => {
    expect(
      listeningGenreNames([
        item('a', { genres: ['Hip Hop', 'Rap'] }),
        item('b', { genres: ['hip-hop', 'Indie'] }),
      ]),
    ).toEqual(['Hip Hop', 'Indie'])
    expect(
      listeningGenresFromTracks(
        [
          item('a', {
            genreItems: [
              { id: 'g-hh', name: 'Hip Hop' },
              { id: 'g-jazz', name: 'Jazz' },
            ],
          }),
          item('b', {
            genreItems: [{ id: 'g-hh', name: 'hip-hop' }, { id: 'g-in', name: 'Indie' }],
          }),
        ],
        3,
      ).map((entry) => ({ id: entry.id, name: entry.name, type: entry.type })),
    ).toEqual([
      { id: 'g-hh', name: 'Hip Hop', type: 'MusicGenre' },
      { id: 'g-jazz', name: 'Jazz', type: 'MusicGenre' },
      { id: 'g-in', name: 'Indie', type: 'MusicGenre' },
    ])
    expect(
      listeningGenresNeedCatalog(
        ['Jazz', 'Soul'],
        [item('g-jazz', { name: 'Jazz', type: 'MusicGenre' })],
      ),
    ).toBe(true)
    expect(
      listeningGenresNeedCatalog(
        ['Jazz'],
        [item('g-jazz', { name: 'Jazz', type: 'MusicGenre' })],
      ),
    ).toBe(false)
    expect(listeningGenresNeedCatalog([], [item('g1', { name: 'Ambient' })])).toBe(
      false,
    )
    expect(
      foldGenreCatalog([
        [item('g-img', { name: 'Jazz', type: 'MusicGenre', imageTag: 'art' })],
        [item('g-stub', { name: 'Jazz', type: 'MusicGenre' })],
        [item('g-soul', { name: 'Soul', type: 'MusicGenre' })],
      ]).map((entry) => ({ id: entry.id, imageTag: entry.imageTag })),
    ).toEqual([
      { id: 'g-img', imageTag: 'art' },
      { id: 'g-soul', imageTag: undefined },
    ])
    expect(
      preferListeningGenres(
        [
          item('g1', { name: 'Ambient', type: 'MusicGenre' }),
          item('g2', { name: 'Hip Hop', type: 'MusicGenre' }),
          item('g3', { name: 'Indie', type: 'MusicGenre' }),
        ],
        ['Indie'],
        2,
      ).map((entry) => entry.name),
    ).toEqual(['Indie', 'Ambient'])
    expect(
      preferListeningGenres(
        [
          item('g1', { name: 'Ambient', type: 'MusicGenre' }),
          item('g2', { name: 'Hip Hop', type: 'MusicGenre' }),
          item('g3', { name: 'Indie', type: 'MusicGenre' }),
        ],
        ['Indie', 'Rap'],
        3,
      ).map((entry) => entry.name),
    ).toEqual(['Indie', 'Hip Hop', 'Ambient'])
    expect(
      excludeTrackIds(
        [item('1'), item('2'), item('3')],
        new Set(['2']),
      ).map((entry) => entry.id),
    ).toEqual(['1', '3'])
  })

  it('collapses near-duplicate mix titles (Hip-Hop vs Hip Hop)', () => {
    expect(mixTitleKey('Hip-Hop Mix')).toBe(mixTitleKey('Hip Hop Mix'))
    expect(mixTitleKey('Tyler, The Creator Mix')).not.toBe(mixTitleKey('Hip Hop Mix'))
  })

  it('filters genre Instant Mix seeds by genre fit', () => {
    const seed: LibraryItem = {
      id: 'genre:hiphop',
      name: 'Hip Hop',
      type: 'MusicGenre',
      artists: [],
      durationMs: 0,
      genres: ['Hip Hop'],
    }
    const filtered = filterInstantMixTracks(seed, [
      item('kdot', {
        artists: ['Kendrick Lamar'],
        genres: ['Hip-Hop'],
      }),
      item('odesza', {
        artists: ['Odesza'],
        genres: ['Electronic'],
      }),
      // Untagged — keep for genre seeds (retrieval already scoped)
      item('sparse', {
        artists: ['Sparse'],
        artistId: 'sparse',
      }),
    ])
    expect(filtered.map((entry) => entry.id)).toEqual(['kdot', 'sparse'])
  })

  it('soft-caps one artist so themed mixes stay varied', () => {
    const mono = Array.from({ length: 12 }, (_, i) =>
      item(`t${i}`, {
        artists: ['Tyler'],
        artistId: 'tyler',
        genres: ['Rap'],
      }),
    )
    const neighbors = [
      item('k1', { artists: ['Kendrick'], artistId: 'k', genres: ['Hip Hop'] }),
      item('k2', { artists: ['Kendrick'], artistId: 'k', genres: ['Hip Hop'] }),
      item('k3', { artists: ['Kendrick'], artistId: 'k', genres: ['Hip Hop'] }),
      item('k4', { artists: ['Kendrick'], artistId: 'k', genres: ['Hip Hop'] }),
      item('s1', { artists: ['SZA'], artistId: 's', genres: ['Rap'] }),
      item('s2', { artists: ['SZA'], artistId: 's', genres: ['Rap'] }),
      item('s3', { artists: ['SZA'], artistId: 's', genres: ['Rap'] }),
      item('j1', { artists: ['JID'], artistId: 'j', genres: ['Rap'] }),
      item('j2', { artists: ['JID'], artistId: 'j', genres: ['Rap'] }),
    ]
    const diversified = diversifyMixTracks([...mono, ...neighbors], 24, 4, 3, {
      seedArtistKey: 'id:tyler',
      seedArtistCap: 2,
    })
    const counts = new Map<string, number>()
    for (const track of diversified) {
      const key = track.artistId ?? ''
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect(counts.get('tyler')).toBeLessThanOrEqual(2)
    expect(counts.get('k')).toBeLessThanOrEqual(6)
    expect(diversified[0]?.artistId).not.toBe('tyler')
    expect(new Set(diversified.map((entry) => entry.artistId)).size).toBeGreaterThanOrEqual(
      3,
    )
  })

  it('keeps genre theme while diversifying Instant Mix rows', () => {
    const seed = item('tyler-seed', {
      artists: ['Tyler'],
      artistId: 'tyler',
      genres: ['Hip Hop'],
    })
    const themed = themedMixTracks(seed, [
      ...Array.from({ length: 10 }, (_, i) =>
        item(`t${i}`, {
          artists: ['Tyler'],
          artistId: 'tyler',
          genres: ['Rap'],
        }),
      ),
      item('kdot', {
        artists: ['Kendrick'],
        artistId: 'k',
        genres: ['Hip-Hop'],
      }),
      item('odesza', {
        artists: ['Odesza'],
        artistId: 'o',
        genres: ['Electronic'],
      }),
      item('sza', { artists: ['SZA'], artistId: 's', genres: ['Rap'] }),
      item('jid', { artists: ['JID'], artistId: 'j', genres: ['Rap'] }),
      item('cole', { artists: ['Cole'], artistId: 'c', genres: ['Hip Hop'] }),
    ])
    expect(themed.some((entry) => entry.artistId === 'o')).toBe(false)
    expect(themed.filter((entry) => entry.artistId === 'tyler').length).toBeLessThanOrEqual(
      5,
    )
    expect(new Set(themed.map((entry) => entry.artistId)).size).toBeGreaterThanOrEqual(3)
  })

  it('keeps similar Instant Mix artists via genre fit, not blacklists', () => {
    const seed = item('tame-seed', {
      artists: ['Tame Impala'],
      artistId: 'tame',
      genres: ['Psychedelic Rock'],
    })
    const filtered = filterInstantMixTracks(seed, [
      item('t1', {
        artists: ['Tame Impala'],
        artistId: 'tame',
        genres: ['Psychedelic Rock'],
      }),
      item('kg', {
        artists: ['King Gizzard'],
        artistId: 'kg',
        genres: ['Psychedelic Rock'],
      }),
      // Untagged Instant Mix neighbor — keep when seed has a genre lane
      item('pond', {
        artists: ['Pond'],
        artistId: 'pond',
      }),
      // Low genre fit (different lane) — filtered without a rap blacklist
      item('bh', {
        artists: ['BROCKHAMPTON'],
        artistId: 'bh',
        genres: ['Hip Hop'],
      }),
      // Low genre fit — filtered without a holiday blacklist
      item('xmas', {
        artists: ['Wham'],
        artistId: 'wham',
        name: 'Last Christmas',
        genres: ['Christmas', 'Pop'],
      }),
      // Partial overlap only — diluted tags stay under the keep floor
      item('weak', {
        artists: ['Weak Match'],
        artistId: 'weak',
        genres: ['Psychedelic Rock', 'Pop', 'Christmas'],
      }),
    ])
    expect(filtered.map((entry) => entry.artistId).sort()).toEqual([
      'kg',
      'pond',
      'tame',
    ])
  })

  it('pads when Instant Mix is long but still a discography', () => {
    const mono = Array.from({ length: 40 }, (_, i) =>
      item(`t${i}`, { artists: ['Tyler'], artistId: 'tyler', genres: ['Rap'] }),
    )
    expect(needsMixDiversityPad(mono, 30)).toBe(true)
    expect(
      needsMixDiversityPad(
        [
          ...mono.slice(0, 4),
          item('k', { artists: ['K'], artistId: 'k' }),
          item('s', { artists: ['S'], artistId: 's' }),
          item('j', { artists: ['J'], artistId: 'j' }),
          item('c', { artists: ['C'], artistId: 'c' }),
        ],
        30,
      ),
    ).toBe(true)
  })
})
