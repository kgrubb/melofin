/** Downloads tab view-model — collection-first, honest storage, pack progress. */

import type { OfflineEntry, OfflineIndex } from '@/src/domain/offline'
import { packTrackIdSet, type SyncPack, type SyncPackIndex } from '@/src/domain/syncPack'

export const DOWNLOAD_BUDGET_GB = [4, 8, 16, 32] as const
export type DownloadBudgetGb = (typeof DOWNLOAD_BUDGET_GB)[number]

export const DOWNLOAD_SEGMENTS = ['albums', 'playlists', 'songs'] as const
export type DownloadSegment = (typeof DOWNLOAD_SEGMENTS)[number]

const BYTES_PER_GB = 1024 * 1024 * 1024

export const bytesFromGb = (gb: number): number => Math.round(gb * BYTES_PER_GB)

export const nearestBudgetGb = (budgetBytes: number): DownloadBudgetGb => {
  const gb = budgetBytes / BYTES_PER_GB
  let best: DownloadBudgetGb = DOWNLOAD_BUDGET_GB[0]
  for (const option of DOWNLOAD_BUDGET_GB) {
    if (Math.abs(option - gb) < Math.abs(best - gb)) best = option
  }
  return best
}

export const formatStorageBytes = (bytes: number): string => {
  const abs = Math.max(0, bytes)
  if (abs < 1024) return `${Math.round(abs)} B`
  const kb = abs / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  const gb = mb / 1024
  return `${gb < 10 ? gb.toFixed(2) : gb.toFixed(1)} GB`
}

export type StorageMeter = {
  readonly usedBytes: number
  readonly budgetBytes: number
  readonly downloadBytes: number
  readonly cacheBytes: number
  readonly ratio: number
  readonly overBudget: boolean
  readonly usedLabel: string
  readonly budgetLabel: string
  readonly detail: string
  readonly accessibilityLabel: string
}

export const storageMeter = (
  index: OfflineIndex,
  packTrackIds: ReadonlySet<string>,
): StorageMeter => {
  let downloadBytes = 0
  let cacheBytes = 0
  for (const entry of Object.values(index.entries)) {
    if (!entry.complete) continue
    if (entry.kind === 'user' || packTrackIds.has(entry.itemId)) {
      downloadBytes += entry.sizeBytes
    } else {
      cacheBytes += entry.sizeBytes
    }
  }
  const usedBytes = downloadBytes + cacheBytes
  const budgetBytes = Math.max(0, index.budgetBytes)
  const overBudget = budgetBytes > 0 && usedBytes > budgetBytes
  const ratio = budgetBytes <= 0 ? 0 : Math.min(1, usedBytes / budgetBytes)
  const usedLabel = formatStorageBytes(usedBytes)
  const budgetLabel = formatStorageBytes(budgetBytes)
  const detail = `${usedLabel} on this device`
  const accessibilityLabel = overBudget
    ? `${usedLabel} used, over the ${budgetLabel} limit`
    : `${usedLabel} of ${budgetLabel} on this device`
  return {
    usedBytes,
    budgetBytes,
    downloadBytes,
    cacheBytes,
    ratio,
    overBudget,
    usedLabel,
    budgetLabel,
    detail,
    accessibilityLabel,
  }
}

export const isKeptOffline = (entry: Pick<OfflineEntry, 'complete'>): boolean =>
  entry.complete

/** Complete on-device tracks (user downloads + prefetch cache), newest file first. */
export const keptOfflineEntries = (
  entries: Readonly<Record<string, OfflineEntry>>,
): readonly OfflineEntry[] =>
  Object.values(entries)
    .filter(isKeptOffline)
    .sort((a, b) => b.downloadedAt - a.downloadedAt || a.title.localeCompare(b.title))

export const playAllEntries = (
  entries: readonly OfflineEntry[],
): readonly OfflineEntry[] =>
  [...entries].sort((a, b) => {
    const album = a.album.localeCompare(b.album)
    if (album !== 0) return album
    return a.title.localeCompare(b.title)
  })

export type DownloadCollection = {
  readonly id: string
  readonly kind: 'album' | 'playlist'
  readonly title: string
  readonly artist: string
  readonly subtitle: string
  readonly artworkUrl?: string
  readonly trackIds: readonly string[]
  readonly completeCount: number
  readonly totalCount: number
  readonly sizeBytes: number
  readonly progress: number
  readonly collectionId?: string
  readonly packId?: string
}

export const packCollectionId = (pack: SyncPack): string =>
  pack.id.startsWith(`${pack.kind}:`) ? pack.id.slice(pack.kind.length + 1) : pack.id

export const collectionCountLabel = (complete: number, total: number): string => {
  const unit = total === 1 ? 'song' : 'songs'
  if (total <= 0) return `0 ${unit}`
  if (complete >= total) return `${total} ${unit}`
  return `${complete} of ${total} ${unit}`
}

const compareTitle = (a: DownloadCollection, b: DownloadCollection): number =>
  a.title.localeCompare(b.title) || a.id.localeCompare(b.id)

const albumGroupKey = (album: string, artist: string): string =>
  `${album.trim().toLowerCase()}\u001f${artist.trim().toLowerCase()}`

const collectionFromTracks = (input: {
  readonly id: string
  readonly kind: 'album' | 'playlist'
  readonly title: string
  readonly artist: string
  readonly trackIds: readonly string[]
  readonly byId: Readonly<Record<string, OfflineEntry>>
  readonly collectionId?: string
  readonly packId?: string
}): DownloadCollection => {
  let completeCount = 0
  let sizeBytes = 0
  let artworkUrl: string | undefined
  for (const trackId of input.trackIds) {
    const entry = input.byId[trackId]
    if (!entry?.complete) continue
    completeCount += 1
    sizeBytes += entry.sizeBytes
    if (!artworkUrl && entry.artworkPath) artworkUrl = entry.artworkPath
  }
  const totalCount = input.trackIds.length
  const progress = totalCount <= 0 ? 0 : completeCount / totalCount
  const sizePart = sizeBytes > 0 ? formatStorageBytes(sizeBytes) : undefined
  const subtitle = [collectionCountLabel(completeCount, totalCount), sizePart]
    .filter(Boolean)
    .join(' · ')
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    artist: input.artist,
    subtitle,
    artworkUrl,
    trackIds: input.trackIds,
    completeCount,
    totalCount,
    sizeBytes,
    progress,
    collectionId: input.collectionId,
    packId: input.packId,
  }
}

const packToCollection = (
  pack: SyncPack,
  byId: Readonly<Record<string, OfflineEntry>>,
): DownloadCollection => {
  const artist =
    pack.kind === 'playlist'
      ? 'Playlist'
      : pack.trackIds.map((id) => byId[id]?.artist.trim()).find(Boolean) ||
        'Album'
  return collectionFromTracks({
    id: pack.id,
    kind: pack.kind,
    title: pack.title,
    artist,
    trackIds: pack.trackIds,
    byId,
    collectionId: packCollectionId(pack),
    packId: pack.id,
  })
}

export const buildDownloadAlbums = (
  entries: Readonly<Record<string, OfflineEntry>>,
  packs: readonly SyncPack[],
): readonly DownloadCollection[] => {
  const albumPacks = packs
    .filter((pack) => pack.kind === 'album')
    .map((pack) => packToCollection(pack, entries))
    .sort(compareTitle)
  const covered = new Set<string>()
  for (const pack of packs) {
    if (pack.kind !== 'album') continue
    for (const trackId of pack.trackIds) covered.add(trackId)
  }
  const groups = new Map<
    string,
    { album: string; artist: string; trackIds: string[] }
  >()
  for (const entry of Object.values(entries)) {
    if (!isKeptOffline(entry) || covered.has(entry.itemId)) continue
    const album = entry.album.trim() || 'Unknown Album'
    const artist = entry.artist.trim()
    const key = albumGroupKey(album, artist)
    const existing = groups.get(key)
    if (existing) {
      existing.trackIds.push(entry.itemId)
      continue
    }
    groups.set(key, { album, artist, trackIds: [entry.itemId] })
  }
  const inferred = [...groups.entries()]
    .map(([key, group]) =>
      collectionFromTracks({
        id: `inferred:${key}`,
        kind: 'album',
        title: group.album,
        artist: group.artist,
        trackIds: [...group.trackIds].sort((a, b) => {
          const left = entries[a]
          const right = entries[b]
          return (left?.title ?? a).localeCompare(right?.title ?? b)
        }),
        byId: entries,
      }),
    )
    .sort(compareTitle)
  return [...albumPacks, ...inferred]
}

export const buildDownloadPlaylists = (
  entries: Readonly<Record<string, OfflineEntry>>,
  packs: readonly SyncPack[],
): readonly DownloadCollection[] =>
  packs
    .filter((pack) => pack.kind === 'playlist')
    .map((pack) => packToCollection(pack, entries))
    .sort(compareTitle)

export const completeEntriesForIds = (
  trackIds: readonly string[],
  byId: Readonly<Record<string, OfflineEntry>>,
): readonly OfflineEntry[] => {
  const out: OfflineEntry[] = []
  for (const trackId of trackIds) {
    const entry = byId[trackId]
    if (entry?.complete) out.push(entry)
  }
  return out
}

export const downloadsPackTrackIds = (syncPacks: SyncPackIndex): ReadonlySet<string> =>
  packTrackIdSet(syncPacks)
