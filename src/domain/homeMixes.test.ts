import { describe, expect, it } from 'vitest'
import {
  artistMixSeedLabel,
  dedupeById,
  foldHomeMixCards,
  genreMixCandidateTracks,
  HOME_MIX_MAX_AGE_MS,
  isHomeMixCacheFresh,
  MIX_PLAY_MIN,
  pickPlayableMixTracks,
  shouldRebuildHomeMixes,
  tryBuildHomeMixCard,
} from '@/src/domain/homeMixes'
import type { LibraryItem } from '@/src/domain/libraryItem'

const item = (
  id: string,
  extras: Partial<LibraryItem> = {},
): LibraryItem => ({
  id,
  name: id,
  type: 'Audio',
  artists: extras.artists ?? ['Artist'],
  durationMs: extras.durationMs ?? 1,
  ...extras,
})

const tracks = (ids: readonly string[], artist = 'A'): readonly LibraryItem[] =>
  ids.map((id) => item(id, { artists: [artist], genres: ['Hip Hop'] }))

/** Enough distinct artists to pass Home mix diversity checks. */
const radioTracks = (
  seed: string,
  extras: readonly LibraryItem[] = [],
): readonly LibraryItem[] => [
  item(`${seed}-1`, {
    artists: [seed],
    artistId: seed,
    genres: ['Hip Hop'],
  }),
  item(`${seed}-2`, {
    artists: ['Kendrick'],
    artistId: `${seed}-k`,
    genres: ['Hip Hop'],
  }),
  item(`${seed}-3`, {
    artists: ['SZA'],
    artistId: `${seed}-s`,
    genres: ['Hip Hop'],
  }),
  item(`${seed}-4`, {
    artists: ['JID'],
    artistId: `${seed}-j`,
    genres: ['Hip Hop'],
  }),
  item(`${seed}-5`, {
    artists: ['Cole'],
    artistId: `${seed}-c`,
    genres: ['Hip Hop'],
  }),
  ...extras,
]

describe('homeMixes', () => {
  it('picks unused tracks when possible', () => {
    expect(
      pickPlayableMixTracks(
        tracks(['1', '2', '3', '4', '5', '6']),
        new Set(['1', '2']),
      ).map((entry) => entry.id),
    ).toEqual(['3', '4', '5', '6'])
    expect(
      pickPlayableMixTracks(tracks(['1', '2', '3', '4']), new Set(['1', '2', '3'])).map(
        (entry) => entry.id,
      ),
    ).toEqual(['1', '2', '3', '4'])
    expect(pickPlayableMixTracks(tracks(['1', '2']), new Set())).toEqual([])
  })

  it('builds named cards and rejects mono / duplicate titles', () => {
    const card = tryBuildHomeMixCard(
      {
        id: 'instant:tyler',
        seedLabel: 'Tyler, The Creator',
        tracks: radioTracks('Tyler, The Creator'),
      },
      new Set(),
      new Set(),
    )
    expect(card?.title).toBe('Tyler, The Creator Mix')
    expect(
      tryBuildHomeMixCard(
        {
          id: 'genre:rock',
          seedLabel: 'rock',
          tracks: radioTracks('Foo Fighters', [
            item('r2', { artists: ['Queens'], artistId: 'q', genres: ['rock'] }),
            item('r3', { artists: ['Nirvana'], artistId: 'n', genres: ['rock'] }),
            item('r4', { artists: ['Pearl'], artistId: 'p', genres: ['rock'] }),
            item('r5', { artists: ['Soundgarden'], artistId: 's', genres: ['rock'] }),
          ]).map((track) => ({ ...track, genres: ['rock'] })),
        },
        new Set(),
        new Set(),
      )?.title,
    ).toBe('Rock Mix')
    expect(
      tryBuildHomeMixCard(
        {
          id: 'instant:mono',
          seedLabel: 'Tyler, The Creator',
          tracks: tracks(['1', '2', '3', '4', '5', '6'], 'Tyler, The Creator'),
        },
        new Set(),
        new Set(),
      ),
    ).toBeNull()
    expect(
      tryBuildHomeMixCard(
        {
          id: 'instant:b',
          seedLabel: 'Tyler, The Creator',
          tracks: radioTracks('Tyler, The Creator', [
            item('extra', {
              artists: ['Frank'],
              artistId: 'frank',
              genres: ['Hip Hop'],
            }),
          ]),
        },
        new Set(),
        new Set(['tylerthecreatormix']),
      ),
    ).toBeNull()
  })

  it('re-packs when exclusions change the track set', () => {
    const candidate = {
      id: 'instant:a',
      seedLabel: 'A',
      tracks: radioTracks('A', [
        item('extra1', { artists: ['X'], artistId: 'x', genres: ['Hip Hop'] }),
        item('extra2', { artists: ['Y'], artistId: 'y', genres: ['Hip Hop'] }),
        item('extra3', { artists: ['Z'], artistId: 'z', genres: ['Hip Hop'] }),
        item('extra4', { artists: ['W'], artistId: 'w', genres: ['Hip Hop'] }),
        item('extra5', { artists: ['V'], artistId: 'v', genres: ['Hip Hop'] }),
      ]),
    }
    const used = new Set(['A-1', 'A-2', 'A-3', 'A-4', 'A-5'])
    const card = tryBuildHomeMixCard(candidate, used, new Set())
    expect(card).not.toBeNull()
    expect(card!.tracks.every((track) => !used.has(track.id))).toBe(true)
  })

  it('folds artist then genre candidates without shared tracks or titles', () => {
    const folded = foldHomeMixCards(
      [
        {
          id: 'instant:a',
          seedLabel: 'A',
          tracks: radioTracks('A'),
        },
        {
          id: 'instant:b',
          seedLabel: 'B',
          tracks: radioTracks('B', [
            item('b-shared', {
              artists: ['A'],
              artistId: 'A',
              genres: ['Hip Hop'],
            }),
          ]),
        },
      ],
      [
        {
          id: 'genre:hiphop',
          seedLabel: 'Hip Hop',
          tracks: [
            item('g1', { artists: ['K'], artistId: 'gk', genres: ['Hip Hop'] }),
            item('g2', { artists: ['L'], artistId: 'gl', genres: ['Hip Hop'] }),
            item('g3', { artists: ['M'], artistId: 'gm', genres: ['Hip Hop'] }),
            item('g4', { artists: ['N'], artistId: 'gn', genres: ['Hip Hop'] }),
            item('g5', { artists: ['O'], artistId: 'go', genres: ['Hip Hop'] }),
          ],
        },
      ],
      3,
    )
    expect(folded.map((card) => card.id)).toEqual([
      'instant:a',
      'instant:b',
      'genre:hiphop',
    ])
    expect(folded[0]?.tracks.some((track) => track.id === 'A-1')).toBe(true)
    expect(folded.every((card) => card.tracks.length >= MIX_PLAY_MIN)).toBe(true)
  })

  it('keeps genre-coherent Instant Mix rows when possible', () => {
    const raw = [
      item('k', { artists: ['Kendrick'], genres: ['Hip-Hop'] }),
      item('o', { artists: ['Odesza'], genres: ['Electronic'] }),
      item('k2', { artists: ['SZA'], genres: ['Hip Hop'] }),
      item('k3', { artists: ['JID'], genres: ['Rap'] }),
      item('k4', { artists: ['Cole'], genres: ['Hip Hop'] }),
    ]
    expect(
      genreMixCandidateTracks('Hip Hop', 'g1', raw).map((entry) => entry.id),
    ).toEqual(['k', 'k2', 'k3', 'k4'])
  })

  it('returns empty when genre coherence finds nothing on-theme', () => {
    const raw = [
      item('1', { artists: ['A'], genres: ['Jazz'] }),
      item('2', { artists: ['B'], genres: ['Jazz'] }),
      item('3', { artists: ['C'], genres: ['Jazz'] }),
      item('4', { artists: ['D'], genres: ['Jazz'] }),
    ]
    expect(genreMixCandidateTracks('Hip Hop', 'g2', raw)).toEqual([])
  })

  it('labels artist seeds and dedupes by id', () => {
    expect(
      artistMixSeedLabel(
        item('t', { artists: ['Tyler, The Creator / Frank'], name: 'Song' }),
      ),
    ).toBe('Tyler, The Creator')
    expect(dedupeById([item('1'), item('1'), item('2')]).map((e) => e.id)).toEqual([
      '1',
      '2',
    ])
  })

  it('treats mix cache as fresh only within a day', () => {
    const now = 1_700_000_000_000
    expect(isHomeMixCacheFresh(undefined, now)).toBe(false)
    expect(isHomeMixCacheFresh(Number.NaN, now)).toBe(false)
    expect(isHomeMixCacheFresh(now + 1, now)).toBe(false)
    expect(isHomeMixCacheFresh(now, now)).toBe(true)
    expect(isHomeMixCacheFresh(now - HOME_MIX_MAX_AGE_MS + 1, now)).toBe(true)
    expect(isHomeMixCacheFresh(now - HOME_MIX_MAX_AGE_MS, now)).toBe(false)
    expect(isHomeMixCacheFresh(now - HOME_MIX_MAX_AGE_MS - 1, now)).toBe(false)
  })

  it('rebuilds empty or stale mixes, but not after a recent failed attempt', () => {
    const now = 1_700_000_000_000
    expect(
      shouldRebuildHomeMixes({ savedAtMs: now, mixCount: 6 }, now),
    ).toBe(false)
    expect(
      shouldRebuildHomeMixes({ savedAtMs: now, mixCount: 0 }, now),
    ).toBe(true)
    expect(
      shouldRebuildHomeMixes(
        { savedAtMs: now - HOME_MIX_MAX_AGE_MS, mixCount: 6 },
        now,
      ),
    ).toBe(true)
    expect(
      shouldRebuildHomeMixes(
        {
          savedAtMs: now - HOME_MIX_MAX_AGE_MS,
          mixCount: 6,
          attemptedAtMs: now,
        },
        now,
      ),
      ).toBe(false)
    expect(
      shouldRebuildHomeMixes({ savedAtMs: now, mixCount: 0, attemptedAtMs: now }, now),
    ).toBe(true)
  })
})
