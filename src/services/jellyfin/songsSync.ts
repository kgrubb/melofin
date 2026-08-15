import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  fetchItemsPage,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import {
  LIBRARY_PAGE_SIZE,
  dedupeLibraryItems,
  shouldFetchNextPage,
} from '@/src/services/jellyfin/libraryPaging'
import { ok, type Result } from '@/src/domain/result'
import type { SongSyncFetchPlan } from '@/src/domain/librarySync'

const yieldToUi = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })

const songQuery = (userId: string) => ({
  userId,
  includeItemTypes: ['Audio'] as const,
  sortBy: ['SortName'] as const,
  sortOrder: ['Ascending'] as const,
})

type Cursor = {
  readonly startIndex: number
  readonly pair: boolean
  readonly knownTotal: number
  readonly loaded: number
}

export type SongPageSink = (
  page: readonly LibraryItem[],
  accumulated: number,
  total: number,
) => void | Promise<void>

/**
 * Stream song pages. Wi-Fi pairs Limit offsets when the sibling start is inside
 * total; a short/failed sibling drops to sequential and re-pairs after a full
 * page. Returns items loaded.
 */
export const forEachSongPage = async (
  context: JellyfinContext,
  userId: string,
  plan: SongSyncFetchPlan,
  onPage: SongPageSink,
  totalHint?: number,
): Promise<Result<number>> => {
  const query = songQuery(userId)
  const { pageSize } = plan
  const canPair = plan.concurrency > 1
  const more = (start: number, len: number, total: number) =>
    shouldFetchNextPage(start, len, total, pageSize)

  const step = async (cursor: Cursor): Promise<Result<number>> => {
    const secondStart = cursor.startIndex + pageSize
    const usePair = cursor.pair && secondStart < cursor.knownTotal

    if (!usePair) {
      const page = await fetchItemsPage(
        context,
        query,
        cursor.startIndex,
        pageSize,
      )
      if (!page.ok) return page
      if (page.value.items.length === 0) return ok(cursor.loaded)
      const total = page.value.total
      const loaded = cursor.loaded + page.value.items.length
      await onPage(page.value.items, loaded, total)
      await yieldToUi()
      if (!more(cursor.startIndex, page.value.items.length, total)) {
        return ok(loaded)
      }
      return step({
        startIndex: cursor.startIndex + page.value.items.length,
        knownTotal: total,
        loaded,
        pair: canPair && page.value.items.length === pageSize,
      })
    }

    const [first, second] = await Promise.all([
      fetchItemsPage(context, query, cursor.startIndex, pageSize),
      fetchItemsPage(context, query, secondStart, pageSize),
    ])
    if (!first.ok) return first
    if (first.value.items.length === 0) return ok(cursor.loaded)

    const total = first.value.total
    const afterFirst = cursor.loaded + first.value.items.length
    await onPage(first.value.items, afterFirst, total)

    const siblingOk =
      first.value.items.length >= pageSize &&
      second.ok &&
      second.value.items.length > 0

    // No usable sibling: stop only when a positive total says we're done
    // (ignore a failed past-end sibling). total=0 must not truncate.
    if (!siblingOk) {
      if (
        total > 0 &&
        cursor.startIndex + first.value.items.length >= total
      ) {
        return ok(afterFirst)
      }
      await yieldToUi()
      return step({
        startIndex: cursor.startIndex + first.value.items.length,
        knownTotal: total,
        loaded: afterFirst,
        pair: false,
      })
    }

    const merged = Math.max(total, second.value.total)
    const loaded = afterFirst + second.value.items.length
    await onPage(second.value.items, loaded, merged)
    await yieldToUi()
    if (!more(secondStart, second.value.items.length, merged)) return ok(loaded)
    return step({
      startIndex: secondStart + second.value.items.length,
      knownTotal: merged,
      loaded,
      pair: second.value.items.length >= pageSize,
    })
  }

  return step({
    startIndex: 0,
    pair: canPair,
    knownTotal:
      totalHint != null && totalHint >= 0 ? totalHint : Number.POSITIVE_INFINITY,
    loaded: 0,
  })
}

/** Page all songs into memory (web), yielding between batches. */
export const fetchSongsProgressive = async (
  context: JellyfinContext,
  userId: string,
  onPage?: SongPageSink,
  plan: SongSyncFetchPlan = {
    pageSize: LIBRARY_PAGE_SIZE,
    concurrency: 1,
  },
  totalHint?: number,
): Promise<Result<readonly LibraryItem[]>> => {
  // Mutable buffer: immutable concat per page is O(n²) on large catalogs.
  const items: LibraryItem[] = []
  const result = await forEachSongPage(
    context,
    userId,
    plan,
    async (page, accumulated, total) => {
      for (const item of page) items.push(item)
      await onPage?.(page, accumulated, total)
    },
    totalHint,
  )
  if (!result.ok) return result
  return ok(dedupeLibraryItems(items))
}
