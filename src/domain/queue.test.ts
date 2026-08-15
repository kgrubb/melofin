import { describe, expect, it } from 'vitest'
import {
  currentTrack,
  clearUpcoming,
  emptyQueue,
  enqueue,
  expandTracksPreservingPlayback,
  indexOfMediaIdInPlayOrder,
  moveQueueViewTrack,
  moveTrack,
  nextIndex,
  patchTrackFavorite,
  playQueueViewIndex,
  playItems,
  playNext,
  insertTracksAt,
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

  it('insertTracksAt splices before later store indices without moving current', () => {
    const linear = playItems(emptyQueue(), [track('a'), track('b'), track('r')], 0)
    const queued = insertTracksAt(linear, [track('x')], 2)
    expect(queued.tracks.map((t) => t.id)).toEqual(['a', 'b', 'x', 'r'])
    expect(queued.currentIndex).toBe(0)

    const shuffled = {
      ...playItems(emptyQueue(), [track('a'), track('b'), track('r1'), track('r2')], 0),
      shuffle: true,
      shuffleOrder: [0, 1, 2, 3] as const,
    }
    const inserted = insertTracksAt(shuffled, [track('x')], 2)
    expect(inserted.tracks.map((t) => t.id)).toEqual(['a', 'b', 'x', 'r1', 'r2'])
    expect(inserted.currentIndex).toBe(0)
    expect(inserted.shuffleOrder.slice(0, 2)).toEqual([0, 1])
    expect(inserted.shuffleOrder[2]).toBe(2)
    expect(new Set(inserted.shuffleOrder)).toEqual(new Set([0, 1, 2, 3, 4]))

    const playingRecommended = {
      ...shuffled,
      currentIndex: 3,
    }
    const shifted = insertTracksAt(playingRecommended, [track('x')], 2)
    expect(shifted.tracks.map((t) => t.id)).toEqual(['a', 'b', 'x', 'r1', 'r2'])
    expect(shifted.currentIndex).toBe(4)
    expect(shifted.tracks[shifted.currentIndex]?.id).toBe('r2')
  })

  it('removeAt keeps remaining shuffle order', () => {
    const state = {
      ...playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 1),
      shuffle: true,
      shuffleOrder: [1, 3, 0, 2] as const,
    }
    expect(queueViewTracks(state).map((t) => t.id)).toEqual(['2', '4', '1', '3'])

    const droppedUpcoming = removeAt(state, 0)
    expect(queueViewTracks(droppedUpcoming).map((t) => t.id)).toEqual(['2', '4', '3'])
    expect(droppedUpcoming.currentIndex).toBe(0)

    const droppedCurrent = removeAt(state, 1)
    expect(droppedCurrent.tracks.map((t) => t.id)).toEqual(['1', '3', '4'])
    expect(droppedCurrent.tracks[droppedCurrent.currentIndex]?.id).toBe('4')
    expect(queueViewTracks(droppedCurrent).map((t) => t.id)).toEqual(['4', '1', '3'])
    expect(nextIndex(droppedUpcoming)).toBe(
      droppedUpcoming.shuffleOrder[
        droppedUpcoming.shuffleOrder.indexOf(droppedUpcoming.currentIndex) + 1
      ],
    )
    expect(droppedUpcoming.tracks[nextIndex(droppedUpcoming)]?.id).toBe('4')
  })

  it('moveTrack remaps shuffle indices without reshuffling', () => {
    const state = {
      ...playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 1),
      shuffle: true,
      shuffleOrder: [1, 3, 0, 2] as const,
    }
    const before = queueViewTracks(state).map((t) => t.id)
    const moved = moveTrack(state, 3, 0)
    expect(queueViewTracks(moved).map((t) => t.id)).toEqual(before)
    expect(new Set(moved.shuffleOrder)).toEqual(new Set([0, 1, 2, 3]))
  })

  it('clears upcoming in linear and shuffle order', () => {
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

  it('reorders the visible queue, including shuffle upcoming', () => {
    const linear = playItems(emptyQueue(), [track('1'), track('2'), track('3')], 0)
    expect(moveQueueViewTrack(linear, 2, 1).tracks.map((t) => t.id)).toEqual([
      '1',
      '3',
      '2',
    ])
    expect(moveQueueViewTrack(linear, 1, 1)).toBe(linear)

    const shuffled = {
      ...playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 2),
      shuffle: true,
      shuffleOrder: [2, 0, 3, 1] as const,
    }
    expect(queueViewTracks(shuffled).map((t) => t.id)).toEqual(['3', '1', '4', '2'])
    const moved = moveQueueViewTrack(shuffled, 1, 3)
    expect(queueViewTracks(moved).map((t) => t.id)).toEqual(['3', '4', '2', '1'])
    expect(moved.tracks.map((t) => t.id)).toEqual(['1', '2', '3', '4'])
    expect(moved.currentIndex).toBe(2)
    expect(moveQueueViewTrack(shuffled, 0, 2)).toBe(shuffled)
    expect(moveQueueViewTrack(shuffled, 2, 0)).toBe(shuffled)

    const linearMid = playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 1)
    expect(queueViewTracks(linearMid).map((t) => t.id)).toEqual(['2', '3', '4'])
    expect(moveQueueViewTrack(linearMid, 0, 2)).toBe(linearMid)
    expect(queueViewTracks(moveQueueViewTrack(linearMid, 2, 1)).map((t) => t.id)).toEqual([
      '2',
      '4',
      '3',
    ])
    const five = playItems(
      emptyQueue(),
      [track('1'), track('2'), track('3'), track('4'), track('5')],
      1,
    )
    expect(queueViewTracks(moveQueueViewTrack(five, 3, 1)).map((t) => t.id)).toEqual([
      '2',
      '5',
      '3',
      '4',
    ])
  })

  it('ignores out-of-range shuffle indices in the queue view', () => {
    const shuffled = {
      ...playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 2),
      shuffle: true,
      shuffleOrder: [2, 0, 99, 3] as const,
    }
    expect(queueViewTracks(shuffled).map((t) => t.id)).toEqual(['3', '1', '4'])
    expect(upcomingCount(shuffled)).toBe(2)
    const jumped = playQueueViewIndex(shuffled, 2)
    expect(jumped.currentIndex).toBe(3)
    expect(queueViewTracks(jumped).map((t) => t.id)).toEqual(['4', '1'])
    expect(queueViewTracks(moveQueueViewTrack(shuffled, 1, 2)).map((t) => t.id)).toEqual([
      '3',
      '4',
      '1',
    ])
  })

  it('playing a shuffled queue row keeps the other upcoming tracks', () => {
    const shuffled = {
      ...playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 2),
      shuffle: true,
      shuffleOrder: [2, 0, 3, 1] as const,
    }
    expect(queueViewTracks(shuffled).map((t) => t.id)).toEqual(['3', '1', '4', '2'])
    const jumped = playQueueViewIndex(shuffled, 2)
    expect(jumped.currentIndex).toBe(3)
    expect(queueViewTracks(jumped).map((t) => t.id)).toEqual(['4', '1', '2'])
    expect(new Set(jumped.shuffleOrder)).toEqual(new Set([0, 1, 2, 3]))
    expect(playQueueViewIndex(shuffled, 0).currentIndex).toBe(2)
    const linear = playItems(emptyQueue(), [track('1'), track('2'), track('3')], 0)
    expect(playQueueViewIndex(linear, 2).currentIndex).toBe(2)
    expect(queueViewTracks(playQueueViewIndex(linear, 2)).map((t) => t.id)).toEqual(['3'])
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
    expect(
      queueViewTracks(playItems(emptyQueue(), [track('1'), track('2'), track('3')], 1)).map(
        (t) => t.id,
      ),
    ).toEqual(['2', '3'])
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
    Array.from({ length: 40 }, () => {
      const shuffled = setShuffle(
        playItems(emptyQueue(), [track('1'), track('2'), track('3'), track('4')], 0),
        true,
      )
      expect(shuffled.shuffleOrder[0]).toBe(0)
      expect(new Set(shuffled.shuffleOrder)).toEqual(new Set([0, 1, 2, 3]))
      orders.add(shuffled.shuffleOrder.join(','))
    })
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
    expect(grown.tracks[2]?.queueEntryId).toBe(seed.tracks[0]?.queueEntryId)

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
