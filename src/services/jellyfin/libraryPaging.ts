export const LIBRARY_PAGE_SIZE = 200

/** Whether another Items page should be requested after this response. */
export const shouldFetchNextPage = (
  startIndex: number,
  pageLength: number,
  totalRecordCount: number,
  pageSize: number = LIBRARY_PAGE_SIZE,
): boolean =>
  pageLength > 0 &&
  pageLength >= pageSize &&
  startIndex + pageLength < Math.max(totalRecordCount, 0)

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
