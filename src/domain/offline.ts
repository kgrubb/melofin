export type OfflineEntry = {
  readonly itemId: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly durationMs: number
  readonly path: string
  readonly sizeBytes: number
  readonly artworkPath?: string
  readonly downloadedAt: number
  readonly lastAccessedAt: number
  readonly kind: 'user' | 'prefetch'
  readonly complete: boolean
}

export type OfflineIndex = {
  readonly entries: Readonly<Record<string, OfflineEntry>>
  readonly budgetBytes: number
}

export const defaultBudgetBytes = 8 * 1024 * 1024 * 1024

export const emptyOfflineIndex = (budgetBytes = defaultBudgetBytes): OfflineIndex => ({
  entries: {},
  budgetBytes,
})

export const totalSizeBytes = (index: OfflineIndex): number =>
  Object.values(index.entries).reduce((sum, entry) => sum + entry.sizeBytes, 0)

export const upsertEntry = (
  index: OfflineIndex,
  entry: OfflineEntry,
): OfflineIndex => ({
  ...index,
  entries: {
    ...index.entries,
    [entry.itemId]: entry,
  },
})

export const removeEntry = (index: OfflineIndex, itemId: string): OfflineIndex => {
  const { [itemId]: _removed, ...rest } = index.entries
  return { ...index, entries: rest }
}

export const touchEntry = (index: OfflineIndex, itemId: string, at: number): OfflineIndex => {
  const entry = index.entries[itemId]
  if (!entry) return index
  return upsertEntry(index, { ...entry, lastAccessedAt: at })
}

export const selectPrefetchEvictions = (
  index: OfflineIndex,
  neededBytes: number,
): readonly string[] => {
  const overflow = totalSizeBytes(index) + neededBytes - index.budgetBytes
  if (overflow <= 0) return []

  const candidates = Object.values(index.entries)
    .filter((entry) => entry.kind === 'prefetch' && entry.complete)
    .slice()
    .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)

  return candidates
    .reduce<{ ids: string[]; freed: number }>(
      (acc, entry) => {
        if (acc.freed >= overflow) return acc
        return {
          ids: [...acc.ids, entry.itemId],
          freed: acc.freed + entry.sizeBytes,
        }
      },
      { ids: [], freed: 0 },
    ).ids
}

export const applyEvictions = (
  index: OfflineIndex,
  itemIds: readonly string[],
): OfflineIndex =>
  itemIds.reduce((acc, id) => removeEntry(acc, id), index)
