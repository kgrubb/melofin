import type { QueueTrack } from '@/src/domain/queue'
import type { JellyfinContext } from '@/src/services/jellyfin/client'

export type LibraryItem = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly artists: readonly string[]
  readonly album?: string
  readonly overview?: string
  readonly durationMs: number
  readonly imageTag?: string
  /** Item id that owns `imageTag` (track id, or album id when falling back). */
  readonly imageItemId?: string
  readonly mediaSourceId?: string
  readonly childCount?: number
}

export const mapBaseItem = (item: Record<string, unknown>): LibraryItem => {
  const runTimeTicks = Number(item.RunTimeTicks ?? 0)
  const artistsValue = item.Artists
  const albumArtistsValue = item.AlbumArtists
  const artistsFromNames = Array.isArray(artistsValue)
    ? artistsValue.map(String)
    : []
  const artistsFromAlbum = Array.isArray(albumArtistsValue)
    ? albumArtistsValue.map((entry) =>
        String((entry as { Name?: string }).Name ?? ''),
      )
    : []
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
  const albumId = item.AlbumId ? String(item.AlbumId) : ''
  const imageTag = primaryTag || albumPrimary || undefined
  const isAudio = String(item.Type ?? '') === 'Audio'
  const imageItemId = primaryTag
    ? id
    : albumId || (imageTag || isAudio ? id : undefined)
  const mediaSourceId =
    Array.isArray(mediaSources) && mediaSources[0]
      ? String((mediaSources[0] as { Id?: string }).Id ?? item.Id ?? '')
      : String(item.Id ?? '')

  const overviewText = item.Overview ? String(item.Overview).trim() : ''

  return {
    id,
    name: String(item.Name ?? 'Unknown'),
    type: String(item.Type ?? 'Unknown'),
    artists: artistsFromNames.length > 0 ? artistsFromNames : artistsFromAlbum,
    album: item.Album ? String(item.Album) : undefined,
    overview: overviewText || undefined,
    durationMs: Math.round(runTimeTicks / 10_000),
    imageTag,
    imageItemId,
    mediaSourceId,
    childCount: item.ChildCount !== undefined ? Number(item.ChildCount) : undefined,
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
})

export type ArtworkSize = 'thumb' | 'card' | 'hero'

const ARTWORK_MAX_HEIGHT: Record<ArtworkSize, number> = {
  thumb: 120,
  card: 320,
  hero: 600,
}

export const artworkUrl = (
  context: JellyfinContext,
  itemId: string,
  tag?: string,
  size: ArtworkSize = 'hero',
): string | undefined => {
  if (!itemId) return undefined
  const token = context.accessToken
    ? `&api_key=${encodeURIComponent(context.accessToken)}`
    : ''
  const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : ''
  const maxHeight = ARTWORK_MAX_HEIGHT[size]
  return `${context.serverUrl}/Items/${itemId}/Images/Primary?maxHeight=${maxHeight}${tagParam}${token}`
}

/** Jellyfin user primary image (profile photo). */
export const userImageUrl = (
  context: JellyfinContext,
  userId: string,
  tag?: string,
  size: ArtworkSize = 'thumb',
): string | undefined => {
  if (!userId) return undefined
  const token = context.accessToken
    ? `&api_key=${encodeURIComponent(context.accessToken)}`
    : ''
  const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : ''
  const maxHeight = ARTWORK_MAX_HEIGHT[size]
  return `${context.serverUrl}/Users/${userId}/Images/Primary?maxHeight=${maxHeight}${tagParam}${token}`
}

export const buildUniversalStreamUrl = (
  context: JellyfinContext,
  itemId: string,
  userId: string,
): string => {
  const params = new URLSearchParams({
    UserId: userId,
    DeviceId: context.deviceId,
    Container: 'mp3,aac,m4a,flac,wav,ogg',
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
