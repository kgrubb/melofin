import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  fetchItemsPage,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { LIBRARY_PAGE_SIZE, dedupeLibraryItems, shouldFetchNextPage } from '@/src/services/jellyfin/libraryPaging'
import { ok, type Result } from '@/src/domain/result'

const yieldToUi = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })

/** Page through all songs, yielding between pages for UI responsiveness. */
export const fetchSongsProgressive = async (
  context: JellyfinContext,
  userId: string,
  onPage?: (
    page: readonly LibraryItem[],
    accumulated: number,
    total: number,
  ) => void | Promise<void>,
): Promise<Result<readonly LibraryItem[]>> => {
  const items: LibraryItem[] = []
  let startIndex = 0
  for (;;) {
    const page = await fetchItemsPage(
      context,
      {
        userId,
        includeItemTypes: ['Audio'],
        sortBy: ['SortName'],
        sortOrder: ['Ascending'],
      },
      startIndex,
      LIBRARY_PAGE_SIZE,
    )
    if (!page.ok) return page
    for (const item of page.value.items) {
      items.push(item)
    }
    await onPage?.(page.value.items, items.length, page.value.total)
    await yieldToUi()
    if (
      !shouldFetchNextPage(
        startIndex,
        page.value.items.length,
        page.value.total,
        LIBRARY_PAGE_SIZE,
      )
    ) {
      return ok(dedupeLibraryItems(items))
    }
    startIndex += page.value.items.length
  }
}
