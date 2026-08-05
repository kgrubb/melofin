import { getPlaystateApi } from '@jellyfin/sdk/lib/utils/api/playstate-api'
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api'
import {
  buildPlaybackProgressBody,
  buildPlaybackStartBody,
  buildPlaybackStopBody,
  type PlaybackReportInput,
} from '@/src/domain/playbackReport'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { logger } from '@/src/logging/logger'

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
    return err(appError('network', 'Start report failed', cause))
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
    return err(appError('network', 'Progress report failed', cause))
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
    return err(appError('network', 'Stop report failed', cause))
  }
}
