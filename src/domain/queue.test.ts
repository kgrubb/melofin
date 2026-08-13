import { describe, expect, it } from 'vitest'
import {
  currentTrack,
  clearUpcoming,
  emptyQueue,
  enqueue,
  expandTracksPreservingPlayback,
  indexOfMediaIdInPlayOrder,
  moveTrack,
  nextIndex,
  patchTrackFavorite,
  playItems,
  playNext,
  playingIdentity,
  prefetchTargets,
  previousIndex,
  removeAt,
  setRepeat,
  setShuffle,
  skipTo,
  shuffleTracks,
  upcomingCount,
  queueViewTracks,
  type QueueTrack,
} from '@/src/domain/queue'

const track = (id: string): QueueTrack => ({
  id,
  title: id,
  artist: 'a',
  album: 'b',
  durationMs: 1000,
})

describe('queue', () => {
  it('plays and enqueues immutably', () => {
    expect(playItems(emptyQueue(), []).tracks).toHaveLength(0)
    const playing = playItems(emptyQueue(), [track('1'), track('2')], 0)
    expect(currentTrack(playing)?.id).toBe('1')
    expect(enqueue(playing, []).tracks).toHaveLength(2)
    const withQueued = enqueue(playing, [track('3')])
    expect(withQueued.tracks.map((t) => t.id)).toEqual(['1', '2', '3'])
    const withNext = playNext(playing, [track('x')])
    expect(withNext.tracks.map((t) => t.id)).toEqual(['1', 'x', '2'])
    expect(playNext(emptyQueue(), [track('z')]).tracks.map((t) => t.id)).toEqual(['z'])
    expect(playNext(emptyQueue(), []).tracks).toHaveLength(0)
  })

  it('enqueues into an empty queue and appends shuffle without reshuffling', () => {
    const empty = enqueue(emptyQueue(), [track('1')])
    expect(empty.currentIndex).toBe(0)
    const shuffled = setShuffle(playItems(emptyQueue(), [track('1'), track('2')], 0), true)
    const before = shuffled.shuffleOrder
    const grown = enqueue(shuffled, [track('3')])
    expect(grown.shuffleOrder).toHaveLength(3)
    expect(grown.shuffleOrder.slice(0, 2)).toEqual(before)
    expect(grown.shuffleOrder[2]).toBe(2)
  })

  it('removes and moves tracks across edge indices', () => {
    const state = playItems(emptyQueue(), [track('1'), track('2'), track('3')], 1)
    expect(removeAt(state, -1)).toBe(state)
    expect(removeAt(state, 99)).toBe(state)
    expect(removeAt(state, 0).tracks.map((t) => t.id)).toEqual(['2', '3'])
    expect(removeAt(state, 1).currentIndex).toBe(1)
    expect(removeAt(state, 2).tracks.map((t) => t.id)).toEqual(['1', '2'])
    expect(removeAt(playItems(emptyQueue(), [track('only')], 0), 0).tracks).toHaveLength(0)

    expect(moveTrack(state, 0, 2).tracks.map((t) => t.id)).toEqual(['2', '3', '1'])
    expect(moveTrack(state, 1, 1)).toBe(state)
    expect(moveTrack(state, -1, 0)).toBe(state)
    expect(moveTrack(state, 0, 99)).toBe(state)
    expect(moveTrack(state, 2, 0).currentIndex).toBe(2)
    const movedCurrent = moveTrack(state, 1, 0)
    expect(movedCurrent.currentIndex).toBe(0)
    const movedBefore = moveTrack(
      playItems(emptyQueue(), [track('1'), track('2'), track('3')], 2),
      0,
      2,
    )
    expect(movedBefore.currentIndex).toBe(1)
  })

  it('handles next/previous with repeat modes', () => {
    const base = playItems(emptyQueue(), [track('1'), track('2')], 1)
    expect(nextIndex(emptyQueue())).toBe(-1)
    expect(previousIndex(emptyQueue())).toBe(-1)
    expect(nextIndex(setRepeat(base, 'one'))).toBe(1)
    expect(previousIndex(setRepeat(base, 'one'))).toBe(1)
    expect(nextIndex(setRepeat(base, 'off'))).toBe(-1)
    expect(previousIndex(skipTo(base, 0))).toBe(0)
    const looping = setRepeat(base, 'all')
    expect(nextIndex(looping)).toBe(0)
    expect(previousIndex(skipTo(looping, 0))).toBe(1)
    expect(nextIndex(skipTo(base, 0))).toBe(1)
  })

  it('navigates shuffle order including wrap and misses', () => {
    const shuffled = setShuffle(
      playItems(emptyQueue(), [track('1'), track('2'), track('3')], 0),
      true,
    )
    expect(shuffled.shuffleOrder).toHaveLength(3)
    const atLast = {
      ...shuffled,
      currentIndex: shuffled.shuffleOrder[shuffled.shuffleOrder.length - 1]!,
    }
    expect(nextIndex(setRepeat(atLast, 'all'))).toBe(shuffled.shuffleOrder[0])
    expect(nextIndex(setRepeat(atLast, 'off'))).toBe(-1)
    const atFirst = { ...shuffled, currentIndex: shuffled.shuffleOrder[0]! }
    expect(previousIndex(setRepeat(atFirst, 'all'))).toBe(
      shuffled.shuffleOrder[shuffled.shuffleOrder.length - 1],
    )
    expect(previousIndex(setRepeat(atFirst, 'off'))).toBe(atFirst.currentIndex)
    const broken = { ...shuffled, shuffleOrder: [9, 8, 7] as const }
    expect(nextIndex(broken)).toBeGreaterThanOrEqual(0)
    expect(previousIndex(broken)).toBeGreaterThanOrEqual(0)
    const mid = {
      ...shuffled,
      currentIndex: shuffled.shuffleOrder[1]!,
    }
    expect(nextIndex(mid)).toBe(shuffled.shuffleOrder[2])
    expect(previousIndex(mid)).toBe(shuffled.shuffleOrder[0])
    expect(setShuffle(shuffled, false).shuffleOrder).toEqual([])
  })

  it('pins the playing index in shuffle order', () => {
    const tapped = playItems(
      setShuffle(emptyQueue(), true),
      [track('1'), track('2'), track('3'), track('4')],
      2,
    )
    expect(tapped.currentIndex).toBe(2)
    expect(tapped.shuffleOrder[0]).toBe(2)
    expect(new Set(tapped.shuffleOrder)).toEqual(new Set([0, 1, 2, 3]))

    const enabled = setShuffle(
      playItems(emptyQueue(), [track('1'), track('2'), track('3')], 1),
      true,
    )
    expect(enabled.shuffleOrder[0]).toBe(1)
    expect(setShuffle(enabled, false).shuffleOrder).toEqual([])
  })

  it('prefetches upcoming tracks with guards', () => {
    const state = playItems(emptyQueue(), [track('1'), track('2'), track('3')], 0)
    expect(prefetchTargets(state, 2).map((t) => t.id)).toEqual(['2', '3'])
    expect(prefetchTargets(emptyQueue(), 2)).toEqual([])
    expect(prefetchTargets(state, 0)).toEqual([])
    expect(prefetchTargets(setRepeat(state, 'one'), 2).map((t) => t.id)).toEqual(['1'])
  })

  it('skips and reads the current track', () => {
    const state = playItems(emptyQueue(), [track('1'), track('2')], 0)
    expect(skipTo(emptyQueue(), 0).currentIndex).toBe(-1)
    expect(skipTo(state, 99).currentIndex).toBe(1)
    expect(currentTrack(emptyQueue())).toBeUndefined()
  })

  it('playNext inserts after the current shuffle position', () => {
    const shuffled = setShuffle(playItems(emptyQueue(), [track('1'), track('2'), track('3')], 0), true)
    const next = playNext(shuffled, [track('n')])
    expect(next.tracks.map((t) => t.id)).toEqual(['1', 'n', '2', '3'])
    expect(next.currentIndex).toBe(0)
    expect(nextIndex(next)).toBe(1)
    expect(next.shuffleOrder).toHaveLength(4)
    expect(new Set(next.shuffleOrder)).toEqual(new Set([0, 1, 2, 3]))
  })

  it('removeAt follows shuffle-next when removing the current track', () => {
    const state = {
      ...playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 1),
      shuffle: true,
      shuffleOrder: [1, 3, 0, 2] as const,
    }
    const removed = removeAt(state, 1)
    expect(removed.tracks.map((t) => t.id)).toEqual(['1', '3', '4'])
    expect(removed.tracks[removed.currentIndex]?.id).toBe('4')
  })

  it('removeAt rebuilds shuffle and adjusts indices before current', () => {
    const shuffled = setShuffle(
      playItems(emptyQueue(), [track('1'), track('2'), track('3')], 2),
      true,
    )
    const removed = removeAt(shuffled, 0)
    expect(removed.currentIndex).toBe(1)
    expect(removed.shuffleOrder).toHaveLength(2)
  })

  it('rebuilds shuffle when moving tracks and clears upcoming', () => {
    const shuffled = setShuffle(
      playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 1),
      true,
    )
    const moved = moveTrack(shuffled, 3, 0)
    expect(moved.shuffleOrder).toHaveLength(4)
    expect(new Set(moved.shuffleOrder)).toEqual(new Set([0, 1, 2, 3]))

    const playing = playItems(emptyQueue(), [track('1'), track('2'), track('3')], 1)
    const cleared = clearUpcoming(playing)
    expect(cleared.tracks.map((t) => t.id)).toEqual(['1', '2'])
    expect(clearUpcoming(cleared)).toBe(cleared)
    expect(clearUpcoming(emptyQueue())).toEqual(emptyQueue())

    const shufflePlaying = setShuffle(
      playItems(emptyQueue(), [track('1'), track('2'), track('3')], 0),
      true,
    )
    const shuffleCleared = clearUpcoming({
      ...shufflePlaying,
      shuffleOrder: [0, 2, 1],
      currentIndex: 0,
    })
    expect(shuffleCleared.tracks.map((t) => t.id)).toEqual(['1'])
    expect(upcomingCount(shufflePlaying)).toBe(2)
    expect(upcomingCount(shuffleCleared)).toBe(0)
  })

  it('indexOfMediaIdInPlayOrder prefers the next duplicate', () => {
    const state = playItems(
      emptyQueue(),
      [track('a'), track('b'), track('a')],
      1,
    )
    expect(indexOfMediaIdInPlayOrder(state, 'a')).toBe(2)
    expect(indexOfMediaIdInPlayOrder(playItems(emptyQueue(), [track('a'), track('b')], 0), 'b')).toBe(1)
  })

  it('queueViewTracks starts at the current shuffle position', () => {
    const state = {
      ...playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 2),
      shuffle: true,
      shuffleOrder: [2, 0, 3, 1] as const,
    }
    expect(queueViewTracks(state).map((t) => t.id)).toEqual(['3', '1', '4', '2'])
    expect(queueViewTracks(skipTo(state, 3)).map((t) => t.id)).toEqual(['4', '2'])
    expect(
      queueViewTracks(playItems(emptyQueue(), [track('1'), track('2')], 0)).map((t) => t.id),
    ).toEqual(['1', '2'])
  })

  it('patches favorite flags on matching tracks', () => {
    const state = playItems(emptyQueue(), [track('1'), track('2')], 0)
    expect(patchTrackFavorite(state, '2', true).tracks[1]?.isFavorite).toBe(true)
  })

  it('shuffles track lists for a seed and randomizes when enabling shuffle', () => {
    const items = [track('1'), track('2'), track('3')]
    expect(shuffleTracks(items, 7)).toEqual(shuffleTracks(items, 7))
    expect(new Set(shuffleTracks(items, 7).map((t) => t.id))).toEqual(
      new Set(['1', '2', '3']),
    )
    const orders = new Set<string>()
    for (let i = 0; i < 40; i += 1) {
      const shuffled = setShuffle(
        playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 0),
        true,
      )
      expect(shuffled.shuffleOrder[0]).toBe(0)
      expect(new Set(shuffled.shuffleOrder)).toEqual(new Set([0, 1, 2, 3]))
      orders.add(shuffled.shuffleOrder.join(','))
    }
    expect(orders.size).toBeGreaterThan(1)
  })

  it('expands the queue without dropping the playing track or reshuffling', () => {
    const seed = playItems(emptyQueue(), [track('c')], 0)
    const early = expandTracksPreservingPlayback(seed, [track('a'), track('b')])
    expect(early).toBe(seed)

    const grown = expandTracksPreservingPlayback(seed, [
      track('a'),
      track('b'),
      track('c'),
      track('d'),
    ])
    expect(grown.currentIndex).toBe(2)
    expect(grown.tracks.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd'])

    const shuffled = setShuffle(playItems(emptyQueue(), [track('c')], 0), true)
    const expanded = expandTracksPreservingPlayback(shuffled, [
      track('a'),
      track('b'),
      track('c'),
      track('d'),
    ])
    expect(expanded.currentIndex).toBe(2)
    expect(expanded.shuffleOrder[0]).toBe(2)
    expect(new Set(expanded.shuffleOrder)).toEqual(new Set([0, 1, 2, 3]))
    expect(nextIndex(expanded)).not.toBe(2)
  })

  it('assigns distinct queue entry ids so duplicate media ids stay distinct', () => {
    const playing = playItems(emptyQueue(), [track('same'), track('same')], 0)
    expect(playing.tracks[0]?.queueEntryId).toBeTruthy()
    expect(playing.tracks[0]?.queueEntryId).not.toBe(playing.tracks[1]?.queueEntryId)
    expect(playingIdentity(playing.tracks[0])).not.toBe(
      playingIdentity(playing.tracks[1]),
    )
  })
})
