import { newQueueEntryId, type QueueTrack } from '@/src/domain/queue'
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
  readonly isFavorite?: boolean
  readonly hasLyrics?: boolean
  /** Jellyfin UserData.Played */
  readonly isPlayed?: boolean
  readonly dateCreatedMs?: number
  readonly lastPlayedMs?: number
  /** Jellyfin LUFS / ReplayGain track gain in dB when present. */
  readonly normalizationGain?: number
}

type NameIdPair = {
  readonly id: string
  readonly name: string
}

const nameIdPairs = (value: unknown): readonly NameIdPair[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const row = entry as { Id?: string; id?: string; Name?: string; name?: string }
      const id = String(row.Id ?? row.id ?? '').trim()
      const name = String(row.Name ?? row.name ?? '').trim()
      return { id, name }
    })
    .filter((entry) => entry.id.length > 0 || entry.name.length > 0)
}

const stringList = (value: unknown): readonly string[] => {
  if (Array.isArray(value)) {
    return value.map(String).filter((name) => name.trim().length > 0)
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

const fieldString = (
  item: Record<string, unknown>,
  pascal: string,
  camel: string,
): string => {
  const raw = item[pascal] ?? item[camel]
  return raw == null ? '' : String(raw).trim()
}

export const mapBaseItem = (item: Record<string, unknown>): LibraryItem => {
  const runTimeTicks = Number(item.RunTimeTicks ?? 0)
  const artistPairs = nameIdPairs(item.ArtistItems ?? item.artistItems)
  const albumArtistPairs = nameIdPairs(item.AlbumArtists ?? item.albumArtists)
  let artists = stringList(item.Artists ?? item.artists)
  if (artists.length === 0) {
    artists = artistPairs.map((entry) => entry.name).filter((name) => name.length > 0)
  }
  if (artists.length === 0) {
    artists = albumArtistPairs
      .map((entry) => entry.name)
      .filter((name) => name.length > 0)
  }
  if (artists.length === 0) {
    artists = stringList(item.AlbumArtist ?? item.albumArtist)
  }
  const id = String(item.Id ?? '')
  const imageTags = item.ImageTags
  const mediaSources = item.MediaSources
  const primaryTag =
    imageTags && typeof imageTags === 'object'
      ? String((imageTags as { Primary?: string }).Primary ?? '')
      : ''
  const albumPrimary = fieldString(item, 'AlbumPrimaryImageTag', 'albumPrimaryImageTag')
  const albumIdRaw = fieldString(item, 'AlbumId', 'albumId')
  const parentIdRaw = fieldString(item, 'ParentId', 'parentId')
  const isAudio = String(item.Type ?? item.type ?? '') === 'Audio'
  // ParentId is the album for library audio; only use it when album art implies that link
  // (playlist children can have ParentId = playlist).
  const albumId =
    albumIdRaw || (isAudio && albumPrimary && parentIdRaw ? parentIdRaw : '') || undefined
  const artistId =
    artistPairs.find((entry) => entry.id)?.id ??
    albumArtistPairs.find((entry) => entry.id)?.id ??
    undefined
  const imageTag = primaryTag || albumPrimary || undefined
  const imageItemId = primaryTag
    ? id
    : albumPrimary && albumId
      ? albumId
      : albumId || (isAudio ? id : undefined)
  const mediaSourceId =
    Array.isArray(mediaSources) && mediaSources[0]
      ? String((mediaSources[0] as { Id?: string }).Id ?? item.Id ?? '')
      : String(item.Id ?? '')

  const overviewText = item.Overview ? String(item.Overview).trim() : ''
  const playlistEntryRaw = item.PlaylistItemId ? String(item.PlaylistItemId).trim() : ''
  const userData = item.UserData
  const isFavorite =
    userData && typeof userData === 'object'
      ? Boolean((userData as { IsFavorite?: boolean }).IsFavorite)
      : undefined
  const isPlayed =
    userData && typeof userData === 'object'
      ? Boolean((userData as { Played?: boolean }).Played)
      : undefined
  const lastPlayedRaw =
    userData && typeof userData === 'object'
      ? (userData as { LastPlayedDate?: string }).LastPlayedDate
      : undefined
  const lastPlayedMs = lastPlayedRaw ? Date.parse(String(lastPlayedRaw)) : Number.NaN
  const createdRaw = item.DateCreated ? Date.parse(String(item.DateCreated)) : Number.NaN
  const hasLyrics =
    item.HasLyrics === undefined || item.HasLyrics === null
      ? undefined
      : Boolean(item.HasLyrics)
  const gainRaw = item.NormalizationGain
  const normalizationGain =
    gainRaw === undefined || gainRaw === null || gainRaw === ''
      ? undefined
      : Number(gainRaw)

  return {
    id,
    name: String(item.Name ?? 'Unknown'),
    type: String(item.Type ?? 'Unknown'),
    artists,
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
    isFavorite,
    hasLyrics,
    isPlayed,
    dateCreatedMs: Number.isFinite(createdRaw) ? createdRaw : undefined,
    lastPlayedMs: Number.isFinite(lastPlayedMs) ? lastPlayedMs : undefined,
    normalizationGain:
      normalizationGain !== undefined && !Number.isNaN(normalizationGain)
        ? normalizationGain
        : undefined,
  }
}

export const toQueueTrack = (
  item: LibraryItem,
  artworkUrlValue?: string,
): QueueTrack => ({
  id: item.id,
  queueEntryId: newQueueEntryId(),
  title: item.name,
  artist: item.artists.join(', ') || 'Unknown Artist',
  album: item.album ?? '',
  durationMs: item.durationMs,
  artworkUrl: artworkUrlValue,
  mediaSourceId: item.mediaSourceId,
  albumId: item.albumId,
  artistId: item.artistId,
  isFavorite: item.isFavorite,
  hasLyrics: item.hasLyrics,
  normalizationGain: item.normalizationGain,
})

type ArtworkSize = 'thumb' | 'card' | 'hero'

/** Pixel caps for @3x phones — old 120/320/600 looked soft in lists + Now Playing. */
const ARTWORK_MAX_HEIGHT: Record<ArtworkSize, number> = {
  thumb: 256,
  card: 640,
  hero: 1200,
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
  return `${context.serverUrl}${path}?maxHeight=${ARTWORK_MAX_HEIGHT[size]}&quality=90${tagParam}${token}`
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
  maxBitrate = 320_000,
): string => {
  const params = new URLSearchParams({
    UserId: userId,
    DeviceId: context.deviceId,
    Container: 'mp3,aac,m4a|aac,alac,flac,alac,wav,aiff,opus',
    TranscodingContainer: 'mp3',
    TranscodingProtocol: 'http',
    AudioCodec: 'mp3',
    MaxStreamingBitrate: String(maxBitrate),
    audioBitRate: String(maxBitrate),
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
  maxBitrate = 320_000,
): string => {
  const params = new URLSearchParams({
    UserId: userId,
    DeviceId: context.deviceId,
    audioCodec: 'mp3',
    container: 'mp3',
    audioBitRate: String(maxBitrate),
    MaxStreamingBitrate: String(maxBitrate),
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
  maxBitrate = 320_000,
): readonly string[] => [
  // Direct mp3 first — AVPlayer is most reliable with this for queue skips.
  buildAudioStreamUrl(context, itemId, userId, maxBitrate),
  buildUniversalStreamUrl(context, itemId, userId, maxBitrate),
]

export const audioAuthHeaders = (
  context: JellyfinContext,
): Readonly<Record<string, string>> | undefined => {
  if (!context.accessToken) return undefined
  return { 'X-Emby-Token': context.accessToken }
}
