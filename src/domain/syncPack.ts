export type SyncPackKind = 'album' | 'playlist'

export type SyncPack = {
  readonly id: string
  readonly kind: SyncPackKind
  readonly title: string
  readonly trackIds: readonly string[]
  readonly createdAt: number
  readonly updatedAt: number
}

export type SyncPackIndex = {
  readonly packs: Readonly<Record<string, SyncPack>>
}

export type SyncPackProgress = {
  readonly packId: string
  readonly total: number
  readonly complete: number
  readonly missingIds: readonly string[]
}

export const emptySyncPackIndex = (): SyncPackIndex => ({ packs: {} })

export const syncPackId = (kind: SyncPackKind, collectionId: string): string =>
  `${kind}:${collectionId}`

export const upsertSyncPack = (
  index: SyncPackIndex,
  pack: SyncPack,
): SyncPackIndex => ({
  packs: { ...index.packs, [pack.id]: pack },
})

export const removeSyncPack = (
  index: SyncPackIndex,
  packId: string,
): SyncPackIndex => {
  const { [packId]: _removed, ...rest } = index.packs
  return { packs: rest }
}

export const packTrackIdSet = (index: SyncPackIndex): ReadonlySet<string> => {
  const ids = new Set<string>()
  for (const pack of Object.values(index.packs)) {
    for (const trackId of pack.trackIds) ids.add(trackId)
  }
  return ids
}

export const diffPackDownloads = (
  desiredTrackIds: readonly string[],
  completeItemIds: ReadonlySet<string>,
): readonly string[] =>
  desiredTrackIds.filter((id) => !completeItemIds.has(id))

export const packProgress = (
  pack: SyncPack,
  completeItemIds: ReadonlySet<string>,
): SyncPackProgress => {
  const missingIds = diffPackDownloads(pack.trackIds, completeItemIds)
  return {
    packId: pack.id,
    total: pack.trackIds.length,
    complete: pack.trackIds.length - missingIds.length,
    missingIds,
  }
}

export const createOrRefreshPack = (input: {
  readonly kind: SyncPackKind
  readonly collectionId: string
  readonly title: string
  readonly trackIds: readonly string[]
  readonly now: number
  readonly existing?: SyncPack
}): SyncPack => ({
  id: syncPackId(input.kind, input.collectionId),
  kind: input.kind,
  title: input.title,
  trackIds: [...input.trackIds],
  createdAt: input.existing?.createdAt ?? input.now,
  updatedAt: input.now,
})

/** Prefetch LRU must not evict pack-backed tracks. */
export const selectPrefetchEvictionsExcludingPacks = (
  candidates: readonly {
    readonly itemId: string
    readonly kind: 'user' | 'prefetch'
    readonly complete: boolean
    readonly lastAccessedAt: number
    readonly sizeBytes: number
  }[],
  budgetBytes: number,
  usedBytes: number,
  neededBytes: number,
  protectedIds: ReadonlySet<string>,
): readonly string[] => {
  const overflow = usedBytes + neededBytes - budgetBytes
  if (overflow <= 0) return []
  const sorted = candidates
    .filter(
      (entry) =>
        entry.kind === 'prefetch' &&
        entry.complete &&
        !protectedIds.has(entry.itemId),
    )
    .toSorted((a, b) => a.lastAccessedAt - b.lastAccessedAt)

  return sorted.reduce<{ ids: string[]; freed: number }>(
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

export const parseSyncPackIndex = (raw: unknown): SyncPackIndex => {
  if (!raw || typeof raw !== 'object') return emptySyncPackIndex()
  const packsRaw = (raw as { packs?: unknown }).packs
  if (!packsRaw || typeof packsRaw !== 'object') return emptySyncPackIndex()
  const packs: Record<string, SyncPack> = {}
  for (const [id, value] of Object.entries(packsRaw)) {
    if (!value || typeof value !== 'object') continue
    const p = value as Record<string, unknown>
    if (p.kind !== 'album' && p.kind !== 'playlist') continue
    if (typeof p.title !== 'string') continue
    const trackIds = Array.isArray(p.trackIds)
      ? p.trackIds.filter((t): t is string => typeof t === 'string')
      : []
    packs[id] = {
      id,
      kind: p.kind,
      title: p.title,
      trackIds,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    }
  }
  return { packs }
}
