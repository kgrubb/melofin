export const LIBRARY_PAGE_SIZE = 200
export const GENRE_TRACK_PAGE_SIZE = 500

/**
 * Continue while the page is full (total may be low) or more items remain
 * before total. A short final page stops.
 */
export const shouldFetchNextPage = (
  startIndex: number,
  pageLength: number,
  totalRecordCount: number,
  pageSize: number = LIBRARY_PAGE_SIZE,
): boolean =>
  pageLength > 0 &&
  (pageLength >= pageSize ||
    startIndex + pageLength < Math.max(totalRecordCount, 0))

/** Prefer the first occurrence of each Jellyfin item id. */
export const dedupeLibraryItems = <T extends { readonly id: string }>(
  items: readonly T[],
): readonly T[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

/** Keep duplicate media ids when playlist entry ids differ. */
export const dedupePlaylistTracks = <
  T extends { readonly id: string; readonly playlistEntryId?: string },
>(
  items: readonly T[],
): readonly T[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.playlistEntryId || item.id
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
