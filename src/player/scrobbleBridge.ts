import { Platform } from 'react-native'
import { msToTicks } from '@/src/domain/jellyfin'
import { currentTrack } from '@/src/domain/queue'
import { enqueueReport, stateRef } from '@/src/player/engineState'
import { resolveTrackSource } from '@/src/player/trackResolver'
import { melioRootUri } from '@/src/storage/jsonFile'
import {
  safeReportProgress,
  safeReportStart,
  safeReportStop,
} from '@/src/services/jellyfin/playstateSync'
import { isMelioScrobbleEnabled } from '@/src/player/outputPolicy'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

export const reportForCurrent = async (phase: 'start' | 'progress' | 'stop') => {
  if (!isMelioScrobbleEnabled()) return
  const queue = usePlayerStore.getState()
  const session = useSessionStore.getState()
  const settings = useSettingsStore.getState()
  const track = currentTrack(queue)
  if (!track || !session.context || !session.session || !queue.playSessionId) return

  const resolved = resolveTrackSource(
    track,
    settings.offlineIndex,
    session.context,
    session.session.userId,
    {
      platform: Platform.OS,
      melioRootUri: Platform.OS === 'web' ? undefined : melioRootUri(),
    },
  )
  const runtimeTicks = msToTicks(track.durationMs)
  const payload = {
    itemId: track.id,
    mediaSourceId: track.mediaSourceId,
    playSessionId: queue.playSessionId,
    positionTicks: msToTicks(queue.positionMs),
    isPaused: !queue.isPlaying,
    canSeek: true,
    playMethod: resolved?.playMethod ?? 'DirectPlay',
  }

  if (phase === 'start') {
    await safeReportStart(session.context, payload)
    stateRef.scrobble = {
      itemId: track.id,
      mediaSourceId: track.mediaSourceId,
      playSessionId: queue.playSessionId,
      playMethod: payload.playMethod,
      runtimeTicks,
    }
    return
  }
  if (phase === 'progress') {
    await safeReportProgress(session.context, payload)
    return
  }
  await safeReportStop(session.context, payload, runtimeTicks)
  stateRef.scrobble = null
}

export const stopAnchoredScrobble = async () => {
  const anchor = stateRef.scrobble
  const session = useSessionStore.getState()
  if (!anchor || !session.context) return
  await safeReportStop(
    session.context,
    {
      itemId: anchor.itemId,
      mediaSourceId: anchor.mediaSourceId,
      playSessionId: anchor.playSessionId,
      positionTicks: msToTicks(stateRef.lastPositionMs),
      isPaused: true,
      canSeek: true,
      playMethod: anchor.playMethod,
    },
    anchor.runtimeTicks,
  )
  stateRef.scrobble = null
}

export const queueReport = (task: () => Promise<unknown>) => enqueueReport(task)
