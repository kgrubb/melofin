import type { LibraryItem } from '@/src/domain/libraryItem'

export const EXPLORE_PLAYLISTS_LIMIT = 8

export type ExploreMixCard = {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly tracks: readonly LibraryItem[]
}

export type ExplorePlaylistEntry<M extends ExploreMixCard = ExploreMixCard> =
  | { readonly kind: 'mix'; readonly mix: M }
  | { readonly kind: 'playlist'; readonly playlist: LibraryItem }

/** Mixes + user playlists, capped. Prefers a blend when both exist. Keeps input order. */
export const assembleExplorePlaylists = <M extends ExploreMixCard>(
  mixes: readonly M[],
  playlists: readonly LibraryItem[],
  limit = EXPLORE_PLAYLISTS_LIMIT,
): readonly ExplorePlaylistEntry<M>[] => {
  if (limit <= 0 || (mixes.length === 0 && playlists.length === 0)) return []
  const mixSlots =
    playlists.length === 0
      ? Math.min(mixes.length, limit)
      : Math.min(mixes.length, Math.ceil(limit / 2))
  const playlistSlots = Math.min(playlists.length, limit - mixSlots)
  const mixExtra = Math.min(mixes.length - mixSlots, limit - mixSlots - playlistSlots)
  return [
    ...mixes.slice(0, mixSlots + mixExtra).map((mix) => ({ kind: 'mix' as const, mix })),
    ...playlists.slice(0, playlistSlots).map((playlist) => ({
      kind: 'playlist' as const,
      playlist,
    })),
  ]
}
