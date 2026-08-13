import { describe, expect, it } from 'vitest'
import { createDownloadScheduler } from '@/src/offline/downloadScheduler'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('createDownloadScheduler', () => {
  it('caps concurrent work', async () => {
    const scheduler = createDownloadScheduler(2)
    const probe = { concurrent: 0, max: 0 }

    const job = async () => {
      probe.concurrent += 1
      probe.max = Math.max(probe.max, probe.concurrent)
      await delay(20)
      probe.concurrent -= 1
    }

    await Promise.all([
      scheduler.enqueue(job),
      scheduler.enqueue(job),
      scheduler.enqueue(job),
      scheduler.enqueue(job),
    ])

    expect(probe.max).toBe(2)
    expect(scheduler.active()).toBe(0)
    expect(scheduler.pending()).toBe(0)
  })

  it('runs tasks in FIFO order for results', async () => {
    const scheduler = createDownloadScheduler(1)
    const order: number[] = []
    await Promise.all([
      scheduler.enqueue(async () => {
        await delay(5)
        order.push(1)
      }),
      scheduler.enqueue(async () => {
        order.push(2)
      }),
      scheduler.enqueue(async () => {
        order.push(3)
      }),
    ])
    expect(order).toEqual([1, 2, 3])
  })

  it('pauses starting new work until resumed', async () => {
    const scheduler = createDownloadScheduler(1)
    const started: number[] = []
    scheduler.pause()
    const first = scheduler.enqueue(async () => {
      started.push(1)
    })
    await delay(15)
    expect(started).toEqual([])
    scheduler.resume()
    await first
    expect(started).toEqual([1])
  })
})
