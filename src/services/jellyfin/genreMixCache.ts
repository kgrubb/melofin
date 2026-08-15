import { ok, type Result } from '@/src/domain/result'
import type { LibraryItem } from '@/src/domain/libraryItem'
import {
  fetchInstantMixFromGenreName,
  INSTANT_MIX_HOME_LIMIT,
} from '@/src/services/jellyfin/library'
import type { JellyfinContext } from '@/src/services/jellyfin/client'

/** Memoize genre Instant Mix fetches within one Home load. */
export const createGenreMixCache = (
  context: JellyfinContext,
  userId: string,
) => {
  const cache = new Map<string, Promise<Result<readonly LibraryItem[]>>>()
  return (name: string): Promise<Result<readonly LibraryItem[]>> => {
    const key = name.trim()
    if (!key) return Promise.resolve(ok([]))
    const hit = cache.get(key)
    if (hit) return hit
    const next = fetchInstantMixFromGenreName(
      context,
      userId,
      key,
      INSTANT_MIX_HOME_LIMIT,
    )
    cache.set(key, next)
    return next
  }
}
