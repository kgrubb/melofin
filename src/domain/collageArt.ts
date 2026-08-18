import type { LibraryItem } from '@/src/domain/libraryItem'

const collageItemKeys = (item: LibraryItem): readonly string[] => {
  const tag = item.imageTag?.trim()
  const albumId =
    item.albumId?.trim() || (item.type === 'MusicAlbum' ? item.id.trim() : '')
  const fallback = item.imageItemId?.trim() || item.id.trim()
  return [
    tag ? `tag:${tag}` : '',
    albumId ? `album:${albumId}` : '',
    !tag && !albumId && fallback ? `id:${fallback}` : '',
  ].filter(Boolean)
}

/** Skip duplicate covers (same image file or same album). Albums with art win over tracks.
 *  Keys for picked items are added to `occupied` so later mixes can skip them. */
export const uniqueCollageItems = (
  items: readonly LibraryItem[],
  limit = 4,
  occupied: Set<string> = new Set(),
): readonly LibraryItem[] => {
  const buckets: [LibraryItem[], LibraryItem[], LibraryItem[], LibraryItem[]] = [
    [],
    [],
    [],
    [],
  ]
  for (const item of items) {
    const album = item.type === 'MusicAlbum' ? 0 : 2
    const tagged = item.imageTag?.trim() ? 0 : 1
    const bucket = buckets[album + tagged]
    if (!bucket) continue
    bucket.push(item)
  }
  const out: LibraryItem[] = []
  for (const bucket of buckets) {
    for (const item of bucket) {
      const keys = collageItemKeys(item)
      if (keys.length === 0 || keys.some((key) => occupied.has(key))) continue
      for (const key of keys) occupied.add(key)
      out.push(item)
      if (out.length >= limit) return out
    }
  }
  return out
}
