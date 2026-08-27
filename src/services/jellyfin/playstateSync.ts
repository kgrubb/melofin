import { AppState, type NativeEventSubscription } from 'react-native'
import NetInfo, { type NetInfoSubscription } from '@react-native-community/netinfo'
import {
  FLUSH_BATCH_SIZE,
  listenedAtToDatePlayed,
  listenToStartInput,
  listenToStopInput,
  qualifiesForSync,
  takeFlushBatch,
  type CompletedListen,
} from '@/src/domain/playstateQueue'
import { newPlaySessionId } from '@/src/domain/playSessionId'
import type { PlaybackReportInput } from '@/src/domain/playbackReport'
import { appError, err, ok, type AppError, type Result } from '@/src/domain/result'
import { logger } from '@/src/logging/logger'
import {
  ackMarkOnListen,
  ackReportOnListen,
  appendCompletedListen,
  loadCompletedListenQueue,
} from '@/src/offline/playstateQueueStore'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  markPlayedItem,
  reportProgress,
  reportStart,
  reportStop,
} from '@/src/services/jellyfin/playbackReport'
import { useSessionStore } from '@/src/store/session'

const isAuthError = (error: AppError): boolean =>
  error.code === 'unauthorized' || error.code === 'forbidden'

let authGate: { readonly inFlight: boolean } = { inFlight: false }

const handleAuthFailure = (error: AppError) => {
  if (!isAuthError(error) || authGate.inFlight) return
  authGate = { inFlight: true }
  void useSessionStore
    .getState()
    .markUnauthorized()
    .finally(() => {
      authGate = { inFlight: false }
    })
}

const isOnline = async (): Promise<boolean> => {
  const net = await NetInfo.fetch()
  return Boolean(net.isConnected && net.isInternetReachable !== false)
}

export const enqueueFailedStopListen = async (
  input: PlaybackReportInput,
  runtimeTicks: number,
  listenedAt = Date.now(),
): Promise<Result<void>> => {
  if (!qualifiesForSync(input.positionTicks, runtimeTicks)) {
    return ok(undefined)
  }
  const listen: CompletedListen = {
    id: newPlaySessionId(),
    itemId: input.itemId,
    ...(input.mediaSourceId === undefined
      ? {}
      : { mediaSourceId: input.mediaSourceId }),
    playSessionId: input.playSessionId,
    positionTicks: input.positionTicks,
    runtimeTicks,
    playMethod: input.playMethod,
    listenedAt,
    enqueuedAt: Date.now(),
    reportAcked: false,
    markAcked: false,
  }
  const result = await appendCompletedListen(listen)
  if (!result.ok) return result
  logger.info('playstate.queued_completed_listen', {
    itemId: listen.itemId,
    playSessionId: listen.playSessionId,
  })
  return ok(undefined)
}

export const safeReportStart = async (
  context: JellyfinContext,
  input: PlaybackReportInput,
): Promise<Result<void>> => {
  const result = await reportStart(context, input)
  if (!result.ok) handleAuthFailure(result.error)
  return result
}

export const safeReportProgress = async (
  context: JellyfinContext,
  input: PlaybackReportInput,
): Promise<Result<void>> => {
  const result = await reportProgress(context, input)
  if (!result.ok) handleAuthFailure(result.error)
  return result
}

export const safeReportStop = async (
  context: JellyfinContext,
  input: PlaybackReportInput,
  runtimeTicks: number,
): Promise<Result<void>> => {
  const result = await reportStop(context, input)
  if (result.ok) return result
  if (isAuthError(result.error)) {
    handleAuthFailure(result.error)
    return result
  }
  await enqueueFailedStopListen(input, runtimeTicks)
  return result
}

const flushListen = async (
  context: JellyfinContext,
  userId: string,
  listen: CompletedListen,
): Promise<Result<'continue' | 'stop_auth'>> => {
  if (!listen.reportAcked) {
    const start = await reportStart(context, listenToStartInput(listen))
    if (!start.ok) {
      return isAuthError(start.error) ? ok('stop_auth') : ok('continue')
    }
    const stop = await reportStop(context, listenToStopInput(listen))
    if (!stop.ok) {
      return isAuthError(stop.error) ? ok('stop_auth') : ok('continue')
    }
    const acked = await ackReportOnListen(listen.id)
    if (!acked.ok) return err(acked.error)
  }

  const latestQueue = await loadCompletedListenQueue()
  if (!latestQueue.ok) return err(latestQueue.error)
  const current = latestQueue.value.listens.find((item) => item.id === listen.id)
  if (!current) return ok('continue')
  if (current.markAcked) return ok('continue')

  const marked = await markPlayedItem(context, {
    itemId: current.itemId,
    userId,
    datePlayed: listenedAtToDatePlayed(current.listenedAt),
  })
  if (!marked.ok) {
    return isAuthError(marked.error) ? ok('stop_auth') : ok('continue')
  }
  const ackedMark = await ackMarkOnListen(current.id)
  if (!ackedMark.ok) return err(ackedMark.error)
  return ok('continue')
}

const flushBatch = async (
  context: JellyfinContext,
  userId: string,
  listens: readonly CompletedListen[],
  index = 0,
): Promise<Result<void>> => {
  if (index >= listens.length) return ok(undefined)
  const step = await flushListen(context, userId, listens[index]!)
  if (!step.ok) return step
  if (step.value === 'stop_auth') {
    handleAuthFailure(appError('unauthorized', 'Playstate flush stopped: auth'))
    return err(appError('unauthorized', 'Playstate flush stopped: auth'))
  }
  return flushBatch(context, userId, listens, index + 1)
}

const runFlush = async (): Promise<Result<void>> => {
  if (!(await isOnline())) return ok(undefined)
  const session = useSessionStore.getState()
  if (!session.context || !session.session) return ok(undefined)

  const loaded = await loadCompletedListenQueue()
  if (!loaded.ok) return loaded
  const batch = takeFlushBatch(loaded.value, FLUSH_BATCH_SIZE)
  if (batch.length === 0) return ok(undefined)

  logger.info('playstate.flush_start', { count: batch.length })
  const result = await flushBatch(
    session.context,
    session.session.userId,
    batch,
  )
  if (!result.ok) {
    logger.warn('playstate.flush_paused', { code: result.error.code })
    return result
  }
  logger.info('playstate.flush_done', { count: batch.length })
  return ok(undefined)
}

const flushChainRef = { current: Promise.resolve() as Promise<void> }

export const flushCompletedListens = (): Promise<Result<void>> => {
  const run = flushChainRef.current.then(runFlush, runFlush)
  flushChainRef.current = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

type SyncHandles = {
  readonly netSub: NetInfoSubscription | null
  readonly appSub: NativeEventSubscription | null
}

const syncRef: { handles: SyncHandles | null } = { handles: null }

export const startPlaystateSync = (): (() => void) => {
  if (syncRef.handles) {
    return () => undefined
  }

  void flushCompletedListens()

  const netSub = NetInfo.addEventListener((net) => {
    const online = Boolean(net.isConnected && net.isInternetReachable !== false)
    if (online) void flushCompletedListens()
  })

  const appSub = AppState.addEventListener('change', (next) => {
    if (next === 'active') void flushCompletedListens()
  })

  syncRef.handles = { netSub, appSub }

  return () => {
    netSub()
    appSub.remove()
    syncRef.handles = null
  }
}
