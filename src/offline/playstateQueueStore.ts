import {
  emptyListenQueue,
  enqueueListen,
  markMarkAcked,
  markReportAcked,
  pruneFullyAcked,
  type CompletedListen,
  type CompletedListenQueue,
} from '@/src/domain/playstateQueue'
import { appError, err, ok, type Result } from '@/src/domain/result'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'

const QUEUE_FILE = 'completed-listens.json'

type WriteTask = () => Promise<unknown>

const createWriteQueue = () => {
  const chainRef = { current: Promise.resolve() as Promise<unknown> }
  return (task: WriteTask): Promise<unknown> => {
    const next = chainRef.current.then(task, task)
    chainRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}

const enqueueWrite = createWriteQueue()

const normalizeListen = (raw: CompletedListen): CompletedListen => ({
  ...raw,
  reportAcked: Boolean(raw.reportAcked),
  markAcked: Boolean(raw.markAcked),
})

const normalizeQueue = (
  raw: CompletedListenQueue | null,
): CompletedListenQueue => {
  if (!raw || !Array.isArray(raw.listens)) return emptyListenQueue()
  return {
    listens: raw.listens.map(normalizeListen),
  }
}

export const loadCompletedListenQueue = async (): Promise<
  Result<CompletedListenQueue>
> => {
  const result = await readJsonFile<CompletedListenQueue>(QUEUE_FILE)
  if (!result.ok) return result
  return ok(normalizeQueue(result.value))
}

const persistQueue = async (
  queue: CompletedListenQueue,
): Promise<Result<void>> =>
  enqueueWrite(async () => {
    const result = await writeJsonFile(QUEUE_FILE, queue)
    if (!result.ok) throw result.error
  })
    .then(() => ok(undefined))
    .catch((cause) =>
      err(appError('storage', 'Unable to persist completed listens', cause)),
    )

export const withCompletedListenQueue = async <T>(
  mutate: (queue: CompletedListenQueue) => {
    readonly queue: CompletedListenQueue
    readonly value: T
  },
): Promise<Result<T>> =>
  enqueueWrite(async () => {
    const loaded = await readJsonFile<CompletedListenQueue>(QUEUE_FILE)
    if (!loaded.ok) throw loaded.error
    const current = normalizeQueue(loaded.value)
    const next = mutate(current)
    const written = await writeJsonFile(QUEUE_FILE, next.queue)
    if (!written.ok) throw written.error
    return next.value
  })
    .then((value) => ok(value as T))
    .catch((cause) =>
      err(appError('storage', 'Unable to update completed listens', cause)),
    )

export const appendCompletedListen = async (
  listen: CompletedListen,
): Promise<Result<CompletedListenQueue>> =>
  withCompletedListenQueue((queue) => {
    const next = enqueueListen(queue, listen)
    return { queue: next, value: next }
  })

export const ackReportOnListen = async (
  id: string,
): Promise<Result<CompletedListenQueue>> =>
  withCompletedListenQueue((queue) => {
    const next = pruneFullyAcked(markReportAcked(queue, id))
    return { queue: next, value: next }
  })

export const ackMarkOnListen = async (
  id: string,
): Promise<Result<CompletedListenQueue>> =>
  withCompletedListenQueue((queue) => {
    const next = pruneFullyAcked(markMarkAcked(queue, id))
    return { queue: next, value: next }
  })

export const replaceCompletedListenQueue = persistQueue
