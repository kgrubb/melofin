import type { QueueTrack, RepeatMode } from '@/src/domain/queue'
import type { Result } from '@/src/domain/result'

export type CastSinkKind = 'local' | 'airplay' | 'chromecast' | 'jellyfin'

export type CastErrorCode =
  | 'offline_track'
  | 'unreachable'
  | 'permission'
  | 'timeout'
  | 'unsupported'
  | 'cancelled'
  | 'auth'

export type CastError = {
  readonly code: CastErrorCode
  readonly message: string
  readonly cause?: unknown
}

export type CastDevice = {
  readonly id: string
  readonly name: string
  readonly kind: CastSinkKind
  readonly subtitle?: string
}

export type ActiveOutput = {
  readonly deviceId: string
  readonly kind: CastSinkKind
  readonly name: string
}

export type TransferPhase = 'idle' | 'transferring' | 'connected' | 'failed'

export type PlaybackSnapshot = {
  readonly track: QueueTrack
  readonly queue: readonly QueueTrack[]
  readonly currentIndex: number
  readonly positionMs: number
  readonly isPlaying: boolean
  readonly repeat: RepeatMode
  readonly shuffle: boolean
}

export type CastStatus = {
  readonly playing: boolean
  readonly positionMs: number
  readonly buffering: boolean
  readonly ended: boolean
  /** Jellyfin / Melio media item id when the sink reports it. */
  readonly itemId?: string
  /** Melio queue entry id when the sink reports it. */
  readonly queueEntryId?: string
}

export type CastProvider = {
  readonly subscribeDevices: (cb: (devices: readonly CastDevice[]) => void) => () => void
  readonly connect: (
    device: CastDevice,
    snapshot: PlaybackSnapshot,
  ) => Promise<Result<void, CastError>>
  readonly disconnect: (reason: string) => Promise<Result<void, CastError>>
  readonly play: () => Promise<Result<void, CastError>>
  readonly pause: () => Promise<Result<void, CastError>>
  readonly seek: (positionMs: number) => Promise<Result<void, CastError>>
  readonly next: () => Promise<Result<void, CastError>>
  readonly previous: () => Promise<Result<void, CastError>>
  /** Absolute sync: load/jump to snapshot current item (not relative next/prev). */
  readonly syncTo: (snapshot: PlaybackSnapshot) => Promise<Result<void, CastError>>
  readonly setVolume?: (volume: number) => Promise<Result<void, CastError>>
  readonly getVolume?: () => Promise<Result<number, CastError>>
  readonly subscribeStatus: (cb: (status: CastStatus) => void) => () => void
}

export const TRANSFER_TIMEOUT_MS = 20_000
export const DISCOVERY_TTL_MS = 30_000
export const JELLYFIN_POLL_MS = 2_000
export const CAST_RECEIVER_APP_ID = 'CC1AD845'

export const LOCAL_DEVICE_ID = 'local'