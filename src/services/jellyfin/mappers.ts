import type { QueueTrack } from '@/src/domain/queue'
import type { JellyfinContext } from '@/src/services/jellyfin/client'

export type LibraryItem = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly artists: readonly string[]
  readonly album?: string
  readonly albumId?: string
  readonly artistId?: string
  readonly overview?: string
  readonly durationMs: number
  readonly imageTag?: string
  /** Item id that owns `imageTag` (track id, or album id when falling back). */
  readonly imageItemId?: string
  readonly mediaSourceId?: string
  readonly childCount?: number
  /** Jellyfin playlist entry id (PlaylistItemId); required for remove/reorder. */
  readonly playlistEntryId?: string
}

type NameIdPair = {
  readonly id: string
  readonly name: string
}

const nameIdPairs = (value: unknown): readonly NameIdPair[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const id = String((entry as { Id?: string }).Id ?? '').trim()
      const name = String((entry as { Name?: string }).Name ?? '').trim()
      return { id, name }
    })
    .filter((entry) => entry.id.length > 0 || entry.name.length > 0)
}

export const mapBaseItem = (item: Record<string, unknown>): LibraryItem => {
  const runTimeTicks = Number(item.RunTimeTicks ?? 0)
  const artistsValue = item.Artists
  const artistPairs = nameIdPairs(item.ArtistItems)
  const albumArtistPairs = nameIdPairs(item.AlbumArtists)
  const artistsFromNames = Array.isArray(artistsValue)
    ? artistsValue.map(String).filter((name) => name.trim().length > 0)
    : []
  const artistsFromPairs = (artistPairs.length > 0 ? artistPairs : albumArtistPairs)
    .map((entry) => entry.name)
    .filter((name) => name.length > 0)
  const id = String(item.Id ?? '')
  const imageTags = item.ImageTags
  const mediaSources = item.MediaSources
  const primaryTag =
    imageTags && typeof imageTags === 'object'
      ? String((imageTags as { Primary?: string }).Primary ?? '')
      : ''
  const albumPrimary = item.AlbumPrimaryImageTag
    ? String(item.AlbumPrimaryImageTag)
    : ''
  const albumIdRaw = item.AlbumId ? String(item.AlbumId).trim() : ''
  const albumId = albumIdRaw || undefined
  const artistId =
    artistPairs.find((entry) => entry.id)?.id ??
    albumArtistPairs.find((entry) => entry.id)?.id ??
    undefined
  const imageTag = primaryTag || albumPrimary || undefined
  const isAudio = String(item.Type ?? '') === 'Audio'
  const imageItemId = primaryTag
    ? id
    : albumIdRaw || (imageTag || isAudio ? id : undefined)
  const mediaSourceId =
    Array.isArray(mediaSources) && mediaSources[0]
      ? String((mediaSources[0] as { Id?: string }).Id ?? item.Id ?? '')
      : String(item.Id ?? '')

  const overviewText = item.Overview ? String(item.Overview).trim() : ''
  const playlistEntryRaw = item.PlaylistItemId ? String(item.PlaylistItemId).trim() : ''

  return {
    id,
    name: String(item.Name ?? 'Unknown'),
    type: String(item.Type ?? 'Unknown'),
    artists: artistsFromNames.length > 0 ? artistsFromNames : artistsFromPairs,
    album: item.Album ? String(item.Album) : undefined,
    albumId,
    artistId,
    overview: overviewText || undefined,
    durationMs: Math.round(runTimeTicks / 10_000),
    imageTag,
    imageItemId,
    mediaSourceId,
    childCount: item.ChildCount !== undefined ? Number(item.ChildCount) : undefined,
    playlistEntryId: playlistEntryRaw || undefined,
  }
}

export const toQueueTrack = (
  item: LibraryItem,
  artworkUrlValue?: string,
): QueueTrack => ({
  id: item.id,
  title: item.name,
  artist: item.artists.join(', ') || 'Unknown Artist',
  album: item.album ?? '',
  durationMs: item.durationMs,
  artworkUrl: artworkUrlValue,
  mediaSourceId: item.mediaSourceId,
  albumId: item.albumId,
  artistId: item.artistId,
})

type ArtworkSize = 'thumb' | 'card' | 'hero'

const ARTWORK_MAX_HEIGHT: Record<ArtworkSize, number> = {
  thumb: 120,
  card: 320,
  hero: 600,
}

const primaryImageUrl = (
  context: JellyfinContext,
  path: string,
  tag: string | undefined,
  size: ArtworkSize,
): string | undefined => {
  if (!path) return undefined
  const token = context.accessToken
    ? `&api_key=${encodeURIComponent(context.accessToken)}`
    : ''
  const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : ''
  return `${context.serverUrl}${path}?maxHeight=${ARTWORK_MAX_HEIGHT[size]}${tagParam}${token}`
}

export const artworkUrl = (
  context: JellyfinContext,
  itemId: string,
  tag?: string,
  size: ArtworkSize = 'hero',
): string | undefined =>
  primaryImageUrl(context, itemId ? `/Items/${itemId}/Images/Primary` : '', tag, size)

/** Jellyfin user primary image (profile photo). */
export const userImageUrl = (
  context: JellyfinContext,
  userId: string,
  tag?: string,
  size: ArtworkSize = 'thumb',
): string | undefined =>
  primaryImageUrl(context, userId ? `/Users/${userId}/Images/Primary` : '', tag, size)

export const buildUniversalStreamUrl = (
  context: JellyfinContext,
  itemId: string,
  userId: string,
): string => {
  const params = new URLSearchParams({
    UserId: userId,
    DeviceId: context.deviceId,
    Container: 'mp3,aac,m4a|aac,alac,flac,alac,wav,aiff,opus',
    TranscodingContainer: 'mp3',
    TranscodingProtocol: 'http',
    AudioCodec: 'mp3',
    MaxStreamingBitrate: '320000',
  })
  if (context.accessToken) {
    params.set('api_key', context.accessToken)
  }
  return `${context.serverUrl}/Audio/${itemId}/universal?${params.toString()}`
}

export const buildAudioStreamUrl = (
  context: JellyfinContext,
  itemId: string,
  userId: string,
): string => {
  const params = new URLSearchParams({
    UserId: userId,
    DeviceId: context.deviceId,
    audioCodec: 'mp3',
    container: 'mp3',
  })
  if (context.accessToken) {
    params.set('api_key', context.accessToken)
  }
  return `${context.serverUrl}/Audio/${itemId}/stream.mp3?${params.toString()}`
}

export const buildPlaybackStreamCandidates = (
  context: JellyfinContext,
  itemId: string,
  userId: string,
): readonly string[] => [
  buildUniversalStreamUrl(context, itemId, userId),
  buildAudioStreamUrl(context, itemId, userId),
]

export const audioAuthHeaders = (
  context: JellyfinContext,
): Readonly<Record<string, string>> | undefined => {
  if (!context.accessToken) return undefined
  return { 'X-Emby-Token': context.accessToken }
}
