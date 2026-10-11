import { Directory, File, Paths } from 'expo-file-system'
import { resizeArtworkUrl } from '@/src/services/jellyfin/library'
import { logger } from '@/src/logging/logger'

const LRU_MAX = 64

type CacheEntry = {
  readonly key: string
  readonly uri: string
}

type ArtworkEpoch = {
  readonly generation: number
}

let artworkEpoch: ArtworkEpoch = { generation: 0 }
const lru = new Map<string, CacheEntry>()

export const bumpArtworkGeneration = (): number => {
  artworkEpoch = { generation: artworkEpoch.generation + 1 }
  return artworkEpoch.generation
}

export const currentArtworkGeneration = (): number => artworkEpoch.generation

export const clearArtworkCache = (): void => {
  lru.clear()
}

const cacheKey = (
  itemId: string | undefined,
  imageTag: string | undefined,
  edge: number,
  uri: string | undefined,
): string => `${itemId ?? ''}|${imageTag ?? ''}|${edge}|${uri ?? ''}`

const touch = (key: string, uri: string): string => {
  if (lru.has(key)) lru.delete(key)
  lru.set(key, { key, uri })
  while (lru.size > LRU_MAX) {
    const oldest = lru.keys().next().value
    if (oldest === undefined) break
    lru.delete(oldest)
  }
  return uri
}

const artDir = () => new Directory(Paths.document, 'melofin', 'carplay-art')

const ensureArtDir = (): Directory | null => {
  try {
    const dir = artDir()
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true })
    }
    return dir
  } catch (cause) {
    logger.warn('CarPlay artwork dir failed', { cause })
    return null
  }
}

const isLocalUri = (uri: string): boolean =>
  uri.startsWith('file:') || uri.startsWith('/')

const cacheFileName = (key: string): string => {
  const safe = key.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
  return `${safe || 'art'}.img`
}

/**
 * Resolve artwork for CarPlay rows. Offline file URIs pass through.
 * Remote URLs are resized then cached under melofin/carplay-art.
 * Returns undefined when `generation` no longer matches (cancelled).
 */
export const resolveCarPlayArtwork = async (opts: {
  readonly uri?: string
  readonly itemId?: string
  readonly imageTag?: string
  readonly edge?: number
  readonly generation: number
}): Promise<string | undefined> => {
  if (opts.generation !== artworkEpoch.generation) return undefined
  const edge = opts.edge && opts.edge > 0 ? Math.round(opts.edge) : 90
  const source = opts.uri?.trim()
  if (!source) return undefined

  const key = cacheKey(opts.itemId, opts.imageTag, edge, source)
  const hit = lru.get(key)
  if (hit) {
    touch(key, hit.uri)
    return opts.generation === artworkEpoch.generation ? hit.uri : undefined
  }

  if (isLocalUri(source)) {
    return opts.generation === artworkEpoch.generation ? touch(key, source) : undefined
  }

  const resized = resizeArtworkUrl(source, 'thumb') ?? source
  const dir = ensureArtDir()
  if (!dir) {
    return opts.generation === artworkEpoch.generation ? resized : undefined
  }

  try {
    const dest = new File(Paths.document, 'melofin', 'carplay-art', cacheFileName(key))
    if (dest.exists) {
      const uri = dest.uri
      return opts.generation === artworkEpoch.generation ? touch(key, uri) : undefined
    }
    const downloaded = await File.downloadFileAsync(resized, dest, { idempotent: true })
    if (opts.generation !== artworkEpoch.generation) return undefined
    const uri = downloaded.uri
    return touch(key, uri)
  } catch (cause) {
    logger.warn('CarPlay artwork fetch failed', { cause, itemId: opts.itemId })
    return opts.generation === artworkEpoch.generation ? resized : undefined
  }
}

/** Result of resolving lock-screen art. `cancelled` means generation advanced. */
export type LockScreenArtwork =
  | { readonly status: 'ok'; readonly uri: string | undefined }
  | { readonly status: 'cancelled' }

/** Now Playing / lock screen: same local cache CarPlay's native loader needs. */
export const resolveLockScreenArtwork = async (
  uri: string | undefined,
): Promise<LockScreenArtwork> => {
  const generation = currentArtworkGeneration()
  if (!uri?.trim()) {
    return generation === currentArtworkGeneration()
      ? { status: 'ok', uri: undefined }
      : { status: 'cancelled' }
  }
  const resolved = await resolveCarPlayArtwork({ uri, edge: 600, generation })
  if (generation !== currentArtworkGeneration()) return { status: 'cancelled' }
  return { status: 'ok', uri: resolved }
}
