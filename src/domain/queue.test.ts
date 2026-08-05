import { describe, expect, it } from 'vitest'
import {
  currentTrack,
  emptyQueue,
  enqueue,
  moveTrack,
  nextIndex,
  playItems,
  playNext,
  prefetchTargets,
  previousIndex,
  removeAt,
  setRepeat,
  setShuffle,
  skipTo,
  shuffleTracks,
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

  it('enqueues into an empty queue and rebuilds shuffle', () => {
    const empty = enqueue(emptyQueue(), [track('1')])
    expect(empty.currentIndex).toBe(0)
    const shuffled = setShuffle(playItems(emptyQueue(), [track('1'), track('2')], 0), true)
    const grown = enqueue(shuffled, [track('3')])
    expect(grown.shuffleOrder).toHaveLength(3)
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

  it('playNext rebuilds shuffle order when enabled', () => {
    const shuffled = setShuffle(playItems(emptyQueue(), [track('1'), track('2')], 0), true)
    expect(playNext(shuffled, [track('n')]).shuffleOrder).toHaveLength(3)
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

  it('shuffles track lists for a seed', () => {
    const items = [track('1'), track('2'), track('3')]
    expect(shuffleTracks(items, 7)).toEqual(shuffleTracks(items, 7))
    expect(new Set(shuffleTracks(items, 7).map((t) => t.id))).toEqual(
      new Set(['1', '2', '3']),
    )
  })
})
