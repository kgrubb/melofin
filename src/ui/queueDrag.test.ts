import { describe, expect, it } from 'vitest'
import {
  emptyQueue,
  moveQueueViewTrack,
  playItems,
  queueViewTracks,
  type QueueTrack,
} from '@/src/domain/queue'
import { queueDragDropIndex, queueDragRowShift } from '@/src/ui/queueDrag'

const H = 68
const track = (id: string): QueueTrack => ({
  id,
  title: id,
  artist: 'a',
  album: 'b',
  durationMs: 1000,
})

describe('queueDragDropIndex', () => {
  it('clamps to upcoming rows and ignores the playing row', () => {
    expect(queueDragDropIndex(2, 0, 5, H)).toBe(2)
    expect(queueDragDropIndex(2, H, 5, H)).toBe(3)
    expect(queueDragDropIndex(2, -H, 5, H)).toBe(1)
    expect(queueDragDropIndex(2, -H * 8, 5, H)).toBe(1)
    expect(queueDragDropIndex(2, H * 8, 5, H)).toBe(4)
    expect(queueDragDropIndex(0, H, 5, H)).toBe(0)
    expect(queueDragDropIndex(1, H, 1, H)).toBe(1)
    expect(queueDragDropIndex(2, H, 5, 0)).toBe(2)
  })

  it('rounds to the nearest row hop', () => {
    expect(queueDragDropIndex(2, H * 0.4, 5, H)).toBe(2)
    expect(queueDragDropIndex(2, H * 0.6, 5, H)).toBe(3)
    expect(queueDragDropIndex(2, -H * 0.6, 5, H)).toBe(1)
  })
})

describe('queueDragRowShift', () => {
  it('opens a gap toward the drop index and leaves the dragged row to the finger', () => {
    expect(queueDragRowShift(0, 1, 3, H)).toBe(0)
    expect(queueDragRowShift(1, 1, 3, H)).toBe(0)
    expect(queueDragRowShift(2, 1, 3, H)).toBe(-H)
    expect(queueDragRowShift(3, 1, 3, H)).toBe(-H)
    expect(queueDragRowShift(4, 1, 3, H)).toBe(0)

    expect(queueDragRowShift(0, 3, 1, H)).toBe(0)
    expect(queueDragRowShift(1, 3, 1, H)).toBe(H)
    expect(queueDragRowShift(2, 3, 1, H)).toBe(H)
    expect(queueDragRowShift(3, 3, 1, H)).toBe(0)
    expect(queueDragRowShift(4, 3, 1, H)).toBe(0)
  })

  it('does not shift when the drop index has not changed', () => {
    expect(queueDragRowShift(2, 2, 2, H)).toBe(0)
    expect(queueDragRowShift(3, 2, 2, H)).toBe(0)
    expect(queueDragRowShift(1, 0, 2, H)).toBe(0)
  })

  it('commits the same order the drop gap previewed', () => {
    const state = playItems(
      emptyQueue(),
      [track('p'), track('a'), track('b'), track('c')],
      0,
    )
    const from = 1
    const to = queueDragDropIndex(from, H * 2, 4, H)
    expect(to).toBe(3)
    expect(queueViewTracks(moveQueueViewTrack(state, from, to)).map((t) => t.id)).toEqual([
      'p',
      'b',
      'c',
      'a',
    ])
  })
})
