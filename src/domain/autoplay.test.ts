import { describe, expect, it } from 'vitest'
import {
  assembleAutoplayBatch,
  AUTOPLAY_REFILL_AT,
  autoplaySeedId,
  autoplayStripFromIndex,
  excludeIdsForAutoplay,
  filterAutoplayTracks,
  pushRecentPlayedId,
  shouldRefillAutoplay,
  stripAutoplayTracks,
} from '@/src/domain/autoplay'
import type { LibraryItem } from '@/src/domain/libraryItem'
import { playItems, emptyQueue, type QueueTrack } from '@/src/domain/queue'

const item = (id: string, type = 'Audio'): LibraryItem => ({
  id,
  name: id,
  type,
  artists: [],
  durationMs: 1,
})

describe('autoplay', () => {
  it('refills only when on, repeat off, below threshold, and idle', () => {
    expect(
      shouldRefillAutoplay({
        autoplayOn: true,
        repeat: 'off',
        upcomingCount: AUTOPLAY_REFILL_AT - 1,
        inFlight: false,
      }),
    ).toBe(true)
    expect(
      shouldRefillAutoplay({
        autoplayOn: true,
        repeat: 'off',
        upcomingCount: AUTOPLAY_REFILL_AT,
        inFlight: false,
      }),
    ).toBe(false)
    expect(
      shouldRefillAutoplay({
        autoplayOn: false,
        repeat: 'off',
        upcomingCount: 0,
        inFlight: false,
      }),
    ).toBe(false)
    expect(
      shouldRefillAutoplay({
        autoplayOn: true,
        repeat: 'all',
        upcomingCount: 0,
        inFlight: false,
      }),
    ).toBe(false)
    expect(
      shouldRefillAutoplay({
        autoplayOn: true,
        repeat: 'off',
        upcomingCount: 0,
        inFlight: true,
      }),
    ).toBe(false)
  })

  it('seeds from queueSource first, then drifts to current', () => {
    expect(
      autoplaySeedId({
        queueSourceId: 'playlist-1',
        currentTrackId: 'song-1',
        autoplayActive: false,
      }),
    ).toBe('playlist-1')
    expect(
      autoplaySeedId({
        queueSourceId: undefined,
        currentTrackId: 'song-1',
        autoplayActive: false,
      }),
    ).toBe('song-1')
    expect(
      autoplaySeedId({
        queueSourceId: 'playlist-1',
        currentTrackId: 'song-2',
        autoplayActive: true,
      }),
    ).toBe('song-2')
    expect(
      autoplaySeedId({
        queueSourceId: 'playlist-1',
        currentTrackId: undefined,
        autoplayActive: true,
        recentTrackIds: ['a', 'b'],
      }),
    ).toBe('b')
  })

  it('filters audio, excludes ids, and caps', () => {
    expect(
      filterAutoplayTracks(
        [item('a'), item('b', 'MusicAlbum'), item('a'), item('c'), item('d')],
        new Set(['c']),
        2,
      ).map((entry) => entry.id),
    ).toEqual(['a', 'd'])
  })

  it('assembles mix then excludes queue and history', () => {
    expect(
      assembleAutoplayBatch(
        [[item('mix-1'), item('mix-2')], [item('pad-1'), item('mix-1')]],
        new Set(['mix-1']),
        8,
      ).map((entry) => entry.id),
    ).toEqual(['mix-2', 'pad-1'])
  })

  it('pushes recent ids with cap and moves duplicates to end', () => {
    expect(pushRecentPlayedId(['a', 'b'], 'c', 3)).toEqual(['a', 'b', 'c'])
    expect(pushRecentPlayedId(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd'])
    expect(pushRecentPlayedId(['a', 'b'], 'a', 3)).toEqual(['b', 'a'])
  })

  it('strips autoplay without removing the current track', () => {
    expect(autoplayStripFromIndex(5, 2, 10)).toBe(5)
    expect(autoplayStripFromIndex(5, 7, 10)).toBe(8)
    expect(autoplayStripFromIndex(5, 9, 10)).toBe(null)
    expect(autoplayStripFromIndex(null, 0, 10)).toBe(null)
  })

  it('builds exclude set from queue and recent', () => {
    const ids = excludeIdsForAutoplay(
      [
        {
          id: 'q1',
          title: 't',
          artist: 'a',
          album: '',
          durationMs: 1,
        },
      ],
      ['r1'],
    )
    expect(ids.has('q1')).toBe(true)
    expect(ids.has('r1')).toBe(true)
  })

  it('does not refill when repeat is one', () => {
    expect(
      shouldRefillAutoplay({
        autoplayOn: true,
        repeat: 'one',
        upcomingCount: 0,
        inFlight: false,
      }),
    ).toBe(false)
  })

  it('prefers current over queueSource after autoplay is active', () => {
    expect(
      autoplaySeedId({
        queueSourceId: 'playlist-1',
        currentTrackId: 'song-9',
        autoplayActive: true,
        recentTrackIds: ['old'],
      }),
    ).toBe('song-9')
  })

  it('strips from after current when playing inside Recommended', () => {
    expect(autoplayStripFromIndex(5, 5, 12)).toBe(6)
  })

  it('strips Recommended store indices and keeps the playing track', () => {
    const queued = playItems(
      emptyQueue(),
      [
        { id: 'a', title: 'a', artist: '', album: '', durationMs: 1 },
        { id: 'b', title: 'b', artist: '', album: '', durationMs: 1 },
        { id: 'r1', title: 'r1', artist: '', album: '', durationMs: 1 },
        { id: 'r2', title: 'r2', artist: '', album: '', durationMs: 1 },
      ] satisfies QueueTrack[],
      0,
    )
    expect(stripAutoplayTracks(queued, 2).tracks.map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
    const playingRecommended = { ...queued, currentIndex: 3 }
    expect(
      stripAutoplayTracks(playingRecommended, 2).tracks.map((t) => t.id),
    ).toEqual(['a', 'b', 'r2'])
    const shuffled = {
      ...playingRecommended,
      shuffle: true,
      shuffleOrder: [0, 1, 3, 2] as const,
    }
    const stripped = stripAutoplayTracks(shuffled, 2)
    expect(stripped.tracks.map((t) => t.id)).toEqual(['a', 'b', 'r2'])
    expect(stripped.tracks[stripped.currentIndex]?.id).toBe('r2')
    expect(stripped.shuffleOrder).toEqual([0, 1, 2])
  })
})
