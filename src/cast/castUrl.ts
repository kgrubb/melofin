import { castError } from '@/src/cast/errors'
import type { CastError } from '@/src/cast/types'
import { err, ok, type Result } from '@/src/domain/result'

/** Cast receivers must fetch the URL themselves. Never hand them file://. */
export const castableUrl = (uri: string): Result<string, CastError> => {
  const trimmed = uri.trim()
  if (!trimmed) {
    return err(castError('unsupported', 'Missing stream URL'))
  }
  if (trimmed.startsWith('file:')) {
    return err(castError('offline_track', 'Offline-only track'))
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return err(castError('unsupported', 'Stream URL must be http(s)'))
    }
    return ok(trimmed)
  } catch (cause) {
    return err(castError('unsupported', 'Invalid stream URL', cause))
  }
}
