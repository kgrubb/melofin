import { newQueueEntryId, type QueueTrack } from '@/src/domain/queue'
import type { LibraryItem } from '@/src/domain/libraryItem'
import type { JellyfinContext } from '@/src/services/jellyfin/client'

export type { LibraryItem } from '@/src/domain/libraryItem'

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
  const artists =
    [
      stringList(item.Artists ?? item.artists),
      artistPairs.map((entry) => entry.name).filter((name) => name.length > 0),
      albumArtistPairs
        .map((entry) => entry.name)
        .filter((name) => name.length > 0),
      stringList(item.AlbumArtist ?? item.albumArtist),
    ].find((list) => list.length > 0) ?? []
  const id = String(item.Id ?? '')
  const imageTags = item.ImageTags ?? item.imageTags
  const mediaSources = item.MediaSources ?? item.mediaSources
  const primaryTag =
    imageTags && typeof imageTags === 'object'
      ? String((imageTags as { Primary?: string }).Primary ?? '')
      : ''
  const albumPrimary = fieldString(item, 'AlbumPrimaryImageTag', 'albumPrimaryImageTag')
  const albumIdRaw = fieldString(item, 'AlbumId', 'albumId')
  const parentIdRaw = fieldString(item, 'ParentId', 'parentId')
  const isAudio = String(item.Type ?? item.type ?? '') === 'Audio'
  const overviewText = fieldString(item, 'Overview', 'overview')
  const playlistEntryRaw = item.PlaylistItemId ? String(item.PlaylistItemId).trim() : ''
  // Library audio ParentId is the album. Playlist children have PlaylistItemId
  // and must not treat the playlist as albumId.
  const albumId =
    albumIdRaw ||
    (isAudio && !playlistEntryRaw && parentIdRaw ? parentIdRaw : '') ||
    undefined
  const artistId =
    artistPairs.find((entry) => entry.id)?.id ??
    albumArtistPairs.find((entry) => entry.id)?.id ??
    undefined
  // Songs rarely have their own Primary; a track ImageTags.Primary often 404s.
  const imageTag = (isAudio ? albumPrimary || primaryTag : primaryTag || albumPrimary) || undefined
  const imageItemId =
    isAudio && albumId
      ? albumId
      : primaryTag
        ? id
        : albumId || undefined
  const mediaSourceId =
    Array.isArray(mediaSources) && mediaSources[0]
      ? String((mediaSources[0] as { Id?: string }).Id ?? item.Id ?? '')
      : String(item.Id ?? '')

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
  const positionTicksRaw =
    userData && typeof userData === 'object'
      ? (userData as { PlaybackPositionTicks?: number | string }).PlaybackPositionTicks
      : undefined
  const positionTicks =
    positionTicksRaw === undefined || positionTicksRaw === null || positionTicksRaw === ''
      ? Number.NaN
      : Number(positionTicksRaw)
  const playbackPositionMs = Number.isFinite(positionTicks)
    ? Math.max(0, Math.round(positionTicks / 10_000))
    : undefined
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

  const genreNames = stringList(item.Genres ?? item.genres)
  const genrePairs = nameIdPairs(item.GenreItems ?? item.genreItems)
  const genres = [
    ...new Set([
      ...genreNames,
      ...genrePairs.map((entry) => entry.name).filter((name) => name.length > 0),
    ]),
  ]
  const genreItems = genrePairs
    .filter((entry) => entry.id.length > 0 && entry.name.length > 0)
    .map((entry) => ({ id: entry.id, name: entry.name }))

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
    playbackPositionMs:
      playbackPositionMs !== undefined && playbackPositionMs > 0
        ? playbackPositionMs
        : undefined,
    normalizationGain:
      normalizationGain !== undefined && !Number.isNaN(normalizationGain)
        ? normalizationGain
        : undefined,
    genres: genres.length > 0 ? genres : undefined,
    genreItems: genreItems.length > 0 ? genreItems : undefined,
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

type ArtworkSize = 'tile' | 'thumb' | 'card' | 'hero'

/** Pixel caps. Tile fits Home rails (~168pt @3x). Thumb covers browse tiles. Hero exceeds Now Playing. */
export const ARTWORK_MAX_PX: Record<ArtworkSize, number> = {
  tile: 384,
  thumb: 720,
  card: 960,
  hero: 2048,
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
  const px = ARTWORK_MAX_PX[size]
  return `${context.serverUrl}${path}?maxWidth=${px}&maxHeight=${px}&quality=96${tagParam}${token}`
}

export const artworkUrl = (
  context: JellyfinContext,
  itemId: string,
  tag?: string,
  size: ArtworkSize = 'hero',
): string | undefined =>
  primaryImageUrl(context, itemId ? `/Items/${itemId}/Images/Primary` : '', tag, size)

/** Point a Jellyfin image URL at another size without rebuilding context. */
export const resizeArtworkUrl = (
  uri: string | undefined,
  size: ArtworkSize,
): string | undefined => {
  if (!uri || uri.startsWith('file:') || uri.startsWith('/')) return uri
  const px = ARTWORK_MAX_PX[size]
  if (!uri.includes('maxHeight=') && !uri.includes('maxWidth=')) return uri
  const resized = uri
    .replace(/maxHeight=\d+/g, `maxHeight=${px}`)
    .replace(/maxWidth=\d+/g, `maxWidth=${px}`)
    .replace(/quality=\d+/g, 'quality=96')
  return resized.includes('maxWidth=')
    ? resized
    : resized.replace(/([?&])maxHeight=/, `$1maxWidth=${px}&maxHeight=`)
}

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

/** Forced MP3 transcoder path. Last-resort failover for decode failures. */
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

/**
 * Static Direct Play (container-preserving, no extension so AVPlayer sniffs
 * Content-Type). Guessing `.flac` / `.m4a` first made non-matching files look
 * loaded while staying silent. Universal + `/stream.mp3` remain failover.
 */
export const buildDirectPlayStreamUrls = (
  context: JellyfinContext,
  itemId: string,
  userId: string,
): readonly string[] => {
  const token = context.accessToken
    ? `&api_key=${encodeURIComponent(context.accessToken)}`
    : ''
  const q = `UserId=${encodeURIComponent(userId)}&DeviceId=${encodeURIComponent(context.deviceId)}&static=true${token}`
  return [`${context.serverUrl}/Audio/${itemId}/stream?${q}`]
}

export const buildPlaybackStreamCandidates = (
  context: JellyfinContext,
  itemId: string,
  userId: string,
  maxBitrate = 320_000,
): readonly string[] => [
  ...buildDirectPlayStreamUrls(context, itemId, userId),
  buildUniversalStreamUrl(context, itemId, userId, maxBitrate),
  buildAudioStreamUrl(context, itemId, userId, maxBitrate),
]

export const audioAuthHeaders = (
  context: JellyfinContext,
): Readonly<Record<string, string>> | undefined => {
  if (!context.accessToken) return undefined
  return { 'X-Emby-Token': context.accessToken }
}
