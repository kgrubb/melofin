import type { LibraryItem } from '@/src/services/jellyfin/library'
import { artworkUrl } from '@/src/services/jellyfin/library'
import { useSessionStore } from '@/src/store/session'

type ArtTrack = {
  readonly id: string
  readonly imageItemId?: string
  readonly imageTag?: string
}

/** Jellyfin thumb URL for a CarPlay list row, when the account and image tag exist. */
export const carPlayArtFor = (item: LibraryItem): string | undefined => {
  const context = useSessionStore.getState().context
  if (!context || !item.imageTag) return undefined
  return artworkUrl(
    context,
    item.imageItemId ?? item.id,
    item.imageTag,
    'thumb',
  )
}

/** Cover URLs for a mix row (image strip or single thumb). */
export const carPlayMixArtworkUris = (
  tracks: readonly ArtTrack[],
  limit = 4,
): readonly string[] => {
  const context = useSessionStore.getState().context
  if (!context || tracks.length === 0) return []
  return tracks
    .filter((track) => Boolean(track.imageTag))
    .slice(0, limit)
    .map(
      (track) =>
        artworkUrl(
          context,
          track.imageItemId ?? track.id,
          track.imageTag,
          'thumb',
        ) ?? '',
    )
    .filter(Boolean)
}
