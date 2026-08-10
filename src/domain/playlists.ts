import { appError, err, ok, type Result } from '@/src/domain/result'

export type PlaylistCacheEntry = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly artists: readonly string[]
  readonly durationMs: number
  readonly childCount?: number
  readonly imageTag?: string
  readonly imageItemId?: string
  readonly overview?: string
}

export const normalizePlaylistName = (raw: string): string =>
  raw.trim().replace(/\s+/g, ' ')

export const validatePlaylistName = (raw: string): Result<string> => {
  const name = normalizePlaylistName(raw)
  if (!name) return err(appError('validation', 'Playlist name is required'))
  return ok(name)
}

export const playlistStub = (
  id: string,
  name: string,
  childCount = 0,
): PlaylistCacheEntry => ({
  id,
  name: normalizePlaylistName(name),
  type: 'Playlist',
  artists: [],
  durationMs: 0,
  childCount,
})

export const upsertPlaylistItem = (
  list: readonly PlaylistCacheEntry[],
  item: PlaylistCacheEntry,
): readonly PlaylistCacheEntry[] => {
  const index = list.findIndex((entry) => entry.id === item.id)
  if (index < 0) return [item, ...list]
  return list.map((entry, i) => (i === index ? item : entry))
}

export const removePlaylistItem = (
  list: readonly PlaylistCacheEntry[],
  id: string,
): readonly PlaylistCacheEntry[] => list.filter((entry) => entry.id !== id)

export const patchPlaylistChildCount = (
  list: readonly PlaylistCacheEntry[],
  id: string,
  childCount: number,
): readonly PlaylistCacheEntry[] => {
  const index = list.findIndex((entry) => entry.id === id)
  if (index < 0) return list
  return list.map((entry, i) => (i === index ? { ...entry, childCount } : entry))
}
