import { getPlaystateApi } from '@jellyfin/sdk/lib/utils/api/playstate-api'
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api'
import axios from 'axios'
import {
  buildPlaybackProgressBody,
  buildPlaybackStartBody,
  buildPlaybackStopBody,
  type PlaybackReportInput,
} from '@/src/domain/playbackReport'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { logger } from '@/src/logging/logger'

const mapPlaystateError = (message: string, cause: unknown): Result<never> => {
  if (axios.isAxiosError(cause)) {
    if (cause.response?.status === 401) {
      return err(appError('unauthorized', message, cause))
    }
    if (cause.response?.status === 403) {
      return err(appError('forbidden', message, cause))
    }
    if (cause.code === 'ECONNABORTED') {
      return err(appError('timeout', message, cause))
    }
  }
  return err(appError('network', message, cause))
}

export const postCapabilities = async (
  context: JellyfinContext,
): Promise<Result<void>> => {
  try {
    await getSessionApi(context.api).postFullCapabilities({
      clientCapabilitiesDto: {
        PlayableMediaTypes: ['Audio'],
        SupportsMediaControl: true,
        SupportsPersistentIdentifier: true,
      },
    })
    return ok(undefined)
  } catch (cause) {
    logger.warn('capabilities failed', { cause })
    return err(appError('network', 'Capabilities failed', cause))
  }
}

export const reportStart = async (
  context: JellyfinContext,
  input: PlaybackReportInput,
): Promise<Result<void>> => {
  try {
    await getPlaystateApi(context.api).reportPlaybackStart({
      playbackStartInfo: buildPlaybackStartBody(input),
    })
    return ok(undefined)
  } catch (cause) {
    return mapPlaystateError('Start report failed', cause)
  }
}

export const reportProgress = async (
  context: JellyfinContext,
  input: PlaybackReportInput,
): Promise<Result<void>> => {
  try {
    await getPlaystateApi(context.api).reportPlaybackProgress({
      playbackProgressInfo: buildPlaybackProgressBody(input),
    })
    return ok(undefined)
  } catch (cause) {
    return mapPlaystateError('Progress report failed', cause)
  }
}

export const reportStop = async (
  context: JellyfinContext,
  input: PlaybackReportInput,
): Promise<Result<void>> => {
  try {
    await getPlaystateApi(context.api).reportPlaybackStopped({
      playbackStopInfo: buildPlaybackStopBody(input),
    })
    return ok(undefined)
  } catch (cause) {
    return mapPlaystateError('Stop report failed', cause)
  }
}

export const markPlayedItem = async (
  context: JellyfinContext,
  input: {
    readonly itemId: string
    readonly userId: string
    readonly datePlayed: string
  },
): Promise<Result<void>> => {
  try {
    await getPlaystateApi(context.api).markPlayedItem({
      itemId: input.itemId,
      userId: input.userId,
      datePlayed: input.datePlayed,
    })
    return ok(undefined)
  } catch (cause) {
    return mapPlaystateError('Mark played failed', cause)
  }
}

export const markUnplayedItem = async (
  context: JellyfinContext,
  input: {
    readonly itemId: string
    readonly userId: string
  },
): Promise<Result<void>> => {
  try {
    await getPlaystateApi(context.api).markUnplayedItem({
      itemId: input.itemId,
      userId: input.userId,
    })
    return ok(undefined)
  } catch (cause) {
    return mapPlaystateError('Mark unplayed failed', cause)
  }
}
