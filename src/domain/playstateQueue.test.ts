import { describe, expect, it } from 'vitest'
import { msToTicks } from '@/src/domain/jellyfin'
import {
  emptyListenQueue,
  enqueueListen,
  listenedAtToDatePlayed,
  listenToStartInput,
  listenToStopInput,
  markMarkAcked,
  markReportAcked,
  pruneFullyAcked,
  qualifiesForSync,
  removeCompletedListens,
  takeFlushBatch,
  type CompletedListen,
} from '@/src/domain/playstateQueue'

const listen = (
  overrides: Partial<CompletedListen> = {},
): CompletedListen => ({
  id: 'a',
  itemId: 'item-1',
  playSessionId: 'sess-1',
  positionTicks: msToTicks(240_000),
  runtimeTicks: msToTicks(300_000),
  playMethod: 'DirectPlay',
  listenedAt: 1_700_000_000_000,
  enqueuedAt: 1_700_000_000_100,
  reportAcked: false,
  markAcked: false,
  ...overrides,
})

describe('playstateQueue', () => {
  it('qualifies listens with the ListenBrainz-style threshold', () => {
    expect(qualifiesForSync(msToTicks(240_000), msToTicks(300_000))).toBe(true)
    expect(qualifiesForSync(msToTicks(30_000), msToTicks(300_000))).toBe(false)
  })

  it('rejects short plays and caps the queue', () => {
    const short = enqueueListen(
      emptyListenQueue(),
      listen({ positionTicks: msToTicks(10_000), runtimeTicks: msToTicks(300_000) }),
    )
    expect(short.listens).toHaveLength(0)

    const grown = Array.from({ length: 3 }, (_, i) =>
      listen({ id: `id-${i}`, playSessionId: `s-${i}` }),
    ).reduce(
      (queue, item) => enqueueListen(queue, item, 2),
      emptyListenQueue(),
    )
    expect(grown.listens.map((item) => item.id)).toEqual(['id-1', 'id-2'])
  })

  it('tracks partial flush acks and prunes when both complete', () => {
    const queued = enqueueListen(emptyListenQueue(), listen())
    const reported = markReportAcked(queued, 'a')
    expect(reported.listens[0]?.reportAcked).toBe(true)
    expect(takeFlushBatch(reported)).toHaveLength(1)

    const marked = markMarkAcked(reported, 'a')
    expect(pruneFullyAcked(marked).listens).toHaveLength(0)
    expect(removeCompletedListens(marked, ['a']).listens).toHaveLength(0)
  })

  it('builds start/stop payloads and ISO datePlayed', () => {
    const item = listen({ mediaSourceId: 'ms' })
    expect(listenToStartInput(item).positionTicks).toBe(0)
    expect(listenToStopInput(item).positionTicks).toBe(item.positionTicks)
    expect(listenedAtToDatePlayed(item.listenedAt)).toBe(
      new Date(item.listenedAt).toISOString(),
    )
  })
})
