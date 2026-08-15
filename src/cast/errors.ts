import type { CastError, CastErrorCode } from '@/src/cast/types'

export const castError = (
  code: CastErrorCode,
  message: string,
  cause?: unknown,
): CastError => ({
  code,
  message,
  ...(cause === undefined ? {} : { cause }),
})

const COPY: Record<CastErrorCode, string> = {
  offline_track: "This track is only available offline and can't be cast.",
  unreachable: "Couldn't reach that device. Check the network and try again.",
  permission: 'Permission is needed to find nearby speakers.',
  timeout: 'Connecting timed out. Try again.',
  unsupported: "That device can't play this track.",
  cancelled: 'Transfer cancelled.',
  auth: 'Sign in again to cast to this device.',
}

export const castErrorMessage = (code: CastErrorCode): string => COPY[code]

export const withCastCopy = (error: CastError): CastError => ({
  ...error,
  message: COPY[error.code] ?? error.message,
})