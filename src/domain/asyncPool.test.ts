import { describe, expect, it } from 'vitest'
import { mapPool } from '@/src/domain/asyncPool'

describe('mapPool', () => {
  it('caps concurrency and preserves order', async () => {
    let active = 0
    let max = 0
    const out = await mapPool([10, 20, 30, 40], 2, async (n, index) => {
      active += 1
      max = Math.max(max, active)
      await new Promise((resolve) => setTimeout(resolve, 5 - index))
      active -= 1
      return n + 1
    })
    expect(out).toEqual([11, 21, 31, 41])
    expect(max).toBeLessThanOrEqual(2)
  })

  it('stops starting work when shouldContinue is false', async () => {
    const started: number[] = []
    await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n)
      await new Promise((resolve) => setTimeout(resolve, 10))
      return n
    }, {
      shouldContinue: () => started.length < 3,
    })
    expect(started.length).toBeLessThan(6)
    expect(started.length).toBeGreaterThanOrEqual(3)
  })
})
