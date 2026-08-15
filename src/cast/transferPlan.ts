import type { TransferState } from '@/src/cast/transferMachine'
import { LOCAL_DEVICE_ID } from '@/src/cast/types'

/** Chromecast / Jellyfin remote need reachability. AirPlay is system-routed. */
export const shouldBlockRemoteTransfer = (
  online: boolean,
  deviceId: string,
): boolean =>
  !online &&
  (deviceId.startsWith('cast:') || deviceId.startsWith('jellyfin:'))

export const isLocalDeviceId = (deviceId: string): boolean =>
  deviceId === LOCAL_DEVICE_ID

/** Ignore a second transfer tap while already transferring to the same target. */
export const shouldIgnoreDuplicateTransfer = (
  prior: TransferState,
  next: TransferState,
): boolean => prior === next && next.phase === 'transferring'

export const shouldSyncRemotePlayback = (args: {
  readonly applyingRemote: boolean
  readonly localAudible: boolean
  readonly prevKey: string | null | undefined
  readonly nextKey: string | null | undefined
  readonly queueChanged?: boolean
}): boolean => {
  if (args.applyingRemote || args.localAudible) return false
  if (!args.nextKey) return false
  if (args.queueChanged) return true
  return args.nextKey !== args.prevKey
}
