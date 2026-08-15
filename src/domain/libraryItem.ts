/** Shared catalog item shape — domain-safe (no service imports). */
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
  /** Jellyfin UserData.PlaybackPositionTicks as milliseconds. */
  readonly playbackPositionMs?: number
  /** Jellyfin LUFS / ReplayGain track gain in dB when present. */
  readonly normalizationGain?: number
  /** Jellyfin Genres / GenreItems names when returned. */
  readonly genres?: readonly string[]
  /** GenreItems with ids — enough to open a genre tile without a catalog crawl. */
  readonly genreItems?: readonly { readonly id: string; readonly name: string }[]
}
