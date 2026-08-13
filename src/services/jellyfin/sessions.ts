import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api'
import { PlaystateCommand } from '@jellyfin/sdk/lib/generated-client/models/playstate-command'
import { PlayCommand } from '@jellyfin/sdk/lib/generated-client/models/play-command'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { logger } from '@/src/logging/logger'
import type { SessionLike } from '@/src/cast/deviceAggregator'

export const listSessions = async (
  context: JellyfinContext,
): Promise<Result<readonly SessionLike[]>> => {
  try {
    const { data } = await getSessionApi(context.api).getSessions({})
    return ok((data ?? []) as SessionLike[])
  } catch (cause) {
    logger.warn('sessions.list_failed', { cause })
    return err(appError('network', 'Failed to list sessions', cause))
  }
}

export const playOnSession = async (
  context: JellyfinContext,
  sessionId: string,
  itemIds: readonly string[],
  startPositionTicks: number,
  startIndex = 0,
): Promise<Result<void>> => {
  try {
    await getSessionApi(context.api).play({
      sessionId,
      playCommand: PlayCommand.PlayNow,
      itemIds: [...itemIds],
      startPositionTicks,
      startIndex,
    })
    return ok(undefined)
  } catch (cause) {
    logger.warn('sessions.play_failed', { cause })
    return err(appError('network', 'Failed to play on session', cause))
  }
}

export const sendPlaystate = async (
  context: JellyfinContext,
  sessionId: string,
  command: PlaystateCommand,
  seekPositionTicks?: number,
): Promise<Result<void>> => {
  try {
    await getSessionApi(context.api).sendPlaystateCommand({
      sessionId,
      command,
      seekPositionTicks,
    })
    return ok(undefined)
  } catch (cause) {
    logger.warn('sessions.playstate_failed', { cause })
    return err(appError('network', 'Playstate command failed', cause))
  }
}

export const jellyfinSessionId = (deviceId: string): string | null => {
  if (!deviceId.startsWith('jellyfin:')) return null
  return deviceId.slice('jellyfin:'.length)
}
