import type { QueueTrack } from '@/src/domain/queue'
import type { LibraryItem } from '@/src/services/jellyfin/mappers'
import { toQueueTrack } from '@/src/services/jellyfin/mappers'

const DEFAULT_CHUNK = 250

export type ArtworkResolver = (item: LibraryItem) => string | undefined

/** Map a single library item into a queue track (hero art optional). */
export const libraryItemToQueueTrack = (
  item: LibraryItem,
  artworkUrl?: string,
): QueueTrack => toQueueTrack(item, artworkUrl)

/**
 * Build queue tracks in chunks so large libraries don't freeze the JS thread.
 * Invokes `onChunk` after each chunk (same buffer, store via map/copy if retaining).
 */
export const materializeQueueTracks = (
  items: readonly LibraryItem[],
  artworkFor: ArtworkResolver,
  options?: {
    readonly chunkSize?: number
    readonly onChunk?: (tracks: readonly QueueTrack[]) => void
    readonly schedule?: (next: () => void) => void
  },
): Promise<readonly QueueTrack[]> => {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK
  const schedule =
    options?.schedule ??
    ((next) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => next())
        return
      }
      setTimeout(next, 0)
    })

  return new Promise((resolve) => {
    const tracks: QueueTrack[] = []

    const pump = (offset: number) => {
      const end = Math.min(offset + chunkSize, items.length)
      for (const item of items.slice(offset, end)) {
        tracks.push(libraryItemToQueueTrack(item, artworkFor(item)))
      }
      options?.onChunk?.(tracks)
      if (end >= items.length) {
        resolve(tracks)
        return
      }
      schedule(() => pump(end))
    }

    pump(0)
  })
}

/**
 * Page library songs from a keyset loader and materialize into queue tracks.
 * Does not require the full catalog in Zustand.
 */
export const materializeQueueTracksFromPages = async (
  loadPage: (
    cursor: { sortName: string; id: string } | null,
    limit: number,
  ) => Promise<readonly LibraryItem[]>,
  artworkFor: ArtworkResolver,
  options?: {
    readonly pageSize?: number
    readonly onChunk?: (tracks: readonly QueueTrack[]) => void
    readonly schedule?: (next: () => void) => void
  },
): Promise<readonly QueueTrack[]> => {
  const pageSize = options?.pageSize ?? DEFAULT_CHUNK
  const schedule =
    options?.schedule ??
    ((next) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => next())
        return
      }
      setTimeout(next, 0)
    })

  return new Promise((resolve, reject) => {
    const tracks: QueueTrack[] = []

    const pump = (cursor: { sortName: string; id: string } | null) => {
      void loadPage(cursor, pageSize)
        .then((page) => {
          if (page.length === 0) {
            resolve(tracks)
            return
          }
          for (const item of page) {
            tracks.push(libraryItemToQueueTrack(item, artworkFor(item)))
          }
          options?.onChunk?.(tracks)
          const last = page[page.length - 1]!
          const nextCursor = {
            sortName: last.name.toLocaleLowerCase(),
            id: last.id,
          }
          if (page.length < pageSize) {
            resolve(tracks)
            return
          }
          schedule(() => pump(nextCursor))
        })
        .catch(reject)
    }

    pump(null)
  })
}
