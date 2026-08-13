import { positionTicksSatisfiesListen } from '@/src/domain/jellyfin'
import type { PlaybackReportInput } from '@/src/domain/playbackReport'

export type CompletedListen = {
  readonly id: string
  readonly itemId: string
  readonly mediaSourceId?: string
  readonly playSessionId: string
  readonly positionTicks: number
  readonly runtimeTicks: number
  readonly playMethod: PlaybackReportInput['playMethod']
  /** Device clock when the listen ended (epoch ms). */
  readonly listenedAt: number
  readonly enqueuedAt: number
  readonly reportAcked: boolean
  readonly markAcked: boolean
}

export type CompletedListenQueue = {
  readonly listens: readonly CompletedListen[]
}

export const MAX_COMPLETED_LISTENS = 500
export const FLUSH_BATCH_SIZE = 40

export const emptyListenQueue = (): CompletedListenQueue => ({ listens: [] })

export const qualifiesForSync = (
  positionTicks: number,
  runtimeTicks: number,
): boolean => positionTicksSatisfiesListen(positionTicks, runtimeTicks)

const dropOldestOverCap = (
  listens: readonly CompletedListen[],
  cap: number,
): readonly CompletedListen[] =>
  listens.length <= cap ? listens : listens.slice(listens.length - cap)

export const enqueueListen = (
  queue: CompletedListenQueue,
  listen: CompletedListen,
  cap = MAX_COMPLETED_LISTENS,
): CompletedListenQueue => {
  if (!qualifiesForSync(listen.positionTicks, listen.runtimeTicks)) {
    return queue
  }
  const withoutDup = queue.listens.filter((item) => item.id !== listen.id)
  return {
    listens: dropOldestOverCap([...withoutDup, listen], cap),
  }
}

export const markReportAcked = (
  queue: CompletedListenQueue,
  id: string,
): CompletedListenQueue => ({
  listens: queue.listens.map((listen) =>
    listen.id === id ? { ...listen, reportAcked: true } : listen,
  ),
})

export const markMarkAcked = (
  queue: CompletedListenQueue,
  id: string,
): CompletedListenQueue => ({
  listens: queue.listens.map((listen) =>
    listen.id === id ? { ...listen, markAcked: true } : listen,
  ),
})

export const removeCompletedListens = (
  queue: CompletedListenQueue,
  ids: readonly string[],
): CompletedListenQueue => {
  if (ids.length === 0) return queue
  const drop = new Set(ids)
  return {
    listens: queue.listens.filter((listen) => !drop.has(listen.id)),
  }
}

/** Drop listens that finished both flush steps. */
export const pruneFullyAcked = (
  queue: CompletedListenQueue,
): CompletedListenQueue => ({
  listens: queue.listens.filter(
    (listen) => !(listen.reportAcked && listen.markAcked),
  ),
})

export const takeFlushBatch = (
  queue: CompletedListenQueue,
  limit = FLUSH_BATCH_SIZE,
): readonly CompletedListen[] =>
  queue.listens.filter((listen) => !(listen.reportAcked && listen.markAcked)).slice(0, limit)

export const listenToStartInput = (
  listen: CompletedListen,
): PlaybackReportInput => ({
  itemId: listen.itemId,
  mediaSourceId: listen.mediaSourceId,
  playSessionId: listen.playSessionId,
  positionTicks: 0,
  isPaused: false,
  canSeek: true,
  playMethod: listen.playMethod,
})

export const listenToStopInput = (
  listen: CompletedListen,
): PlaybackReportInput => ({
  itemId: listen.itemId,
  mediaSourceId: listen.mediaSourceId,
  playSessionId: listen.playSessionId,
  positionTicks: listen.positionTicks,
  isPaused: true,
  canSeek: true,
  playMethod: listen.playMethod,
})

export const listenedAtToDatePlayed = (listenedAt: number): string =>
  new Date(listenedAt).toISOString()
