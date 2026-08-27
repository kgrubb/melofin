import type { LibraryItem } from '@/src/domain/libraryItem'
import type { OfflineEntry } from '@/src/domain/offline'

export type HomeMixCopy = {
  readonly instantMix: string
  readonly favoritesMix: string
  readonly yourMix: string
  readonly madeForYou: string
  readonly mixDot: (name: string) => string
  readonly mixNamed: (name: string) => string
  readonly artistsTwo: (first: string, second: string) => string
  readonly artistsThreeAndMore: (
    first: string,
    second: string,
    third: string,
  ) => string
}

export const defaultHomeMixCopy: HomeMixCopy = {
  instantMix: 'Instant Mix',
  favoritesMix: 'Favorites mix',
  yourMix: 'Your Mix',
  madeForYou: 'Made for you',
  mixDot: (name) => `Mix · ${name}`,
  mixNamed: (name) => `${name} Mix`,
  artistsTwo: (first, second) => `${first}, ${second}`,
  artistsThreeAndMore: (first, second, third) =>
    `${first}, ${second}, ${third} and more`,
}

export type AlbumCardCopy = {
  readonly songCount: (count: number) => string
  readonly addedOn: (date: string) => string
}

export const defaultAlbumCardCopy: AlbumCardCopy = {
  songCount: (count) => (count === 1 ? '1 song' : `${count} songs`),
  addedOn: (date) => `Added ${date}`,
}

/** Group Instant Mix seeds by artist (then album / item). */
export const mixSeedKey = (item: LibraryItem): string => {
  if (item.artistId?.trim()) return `artist:${item.artistId.trim()}`
  const named = item.artists.find((name) => name.trim().length > 0)?.trim()
  if (named) return `name:${named.toLowerCase()}`
  if (item.albumId?.trim()) return `album:${item.albumId.trim()}`
  return `item:${item.id}`
}

/** Prefer Audio seeds so album/playlist rows don't crowd out songs. */
export const assembleMixSeeds = (
  candidates: readonly LibraryItem[],
  limit = 3,
): readonly LibraryItem[] => {
  const out: LibraryItem[] = []
  const seen = new Set<string>()
  const ordered = [
    ...candidates.filter((item) => item.type === 'Audio'),
    ...candidates.filter((item) => item.type !== 'Audio'),
  ]
  for (const item of ordered) {
    if (!item.id) continue
    const credit = item.artists.find((name) => name.trim().length > 0)?.trim() ?? ''
    if (isCollabArtistName(credit)) continue
    const key = mixSeedKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) return out
  }
  return out
}

export const recentMixTitle = (): string => 'Recently played'

const artistNameKey = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** `;` `|` always split. Bare `/` is a band name when both sides are short (AC/DC). */
const splitArtistCredits = (raw: string): readonly string[] => {
  const out: string[] = []
  for (const chunk of raw.split(/\s*[|;]\s*/)) {
    const token = chunk.trim()
    if (!token) continue
    const parts = token.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean)
    const collab =
      parts.length > 1 &&
      (/\s\/|\/\s/.test(token) ||
        parts.some((part) => /\s/.test(part)) ||
        parts.every((part) => part.length >= 4))
    if (collab) out.push(...parts)
    else out.push(token)
  }
  return out
}

const isCollabArtistName = (name: string): boolean => splitArtistCredits(name).length > 1

export const primaryArtistName = (
  artists: readonly string[],
  fallback = '',
): string => {
  const raw = artists.find((name) => name.trim().length > 0)?.trim() ?? fallback.trim()
  if (!raw) return ''
  return splitArtistCredits(raw)[0] ?? raw
}

export const withArtistsFromTracks = (
  albums: readonly LibraryItem[],
  tracks: readonly LibraryItem[],
): readonly LibraryItem[] => {
  const byAlbum = new Map<string, string>()
  for (const track of tracks) {
    const albumId = track.albumId?.trim()
    if (!albumId || byAlbum.has(albumId)) continue
    const artist = primaryArtistName(track.artists)
    if (artist) byAlbum.set(albumId, artist)
  }
  return albums.map((album) => {
    if (album.type !== 'MusicAlbum' || primaryArtistName(album.artists)) return album
    const artist = byAlbum.get(album.id)
    return artist ? { ...album, artists: [artist] } : album
  })
}

export const albumCardSubtitle = (
  item: LibraryItem,
  copy: AlbumCardCopy = defaultAlbumCardCopy,
): string => {
  const artist = primaryArtistName(item.artists)
  if (artist) return artist
  const album = item.album?.trim()
  if (album) return album
  const n = item.childCount ?? 0
  if (item.type !== 'Audio' && n > 0) return copy.songCount(n)
  if (item.type !== 'MusicAlbum' || !item.dateCreatedMs) return ''
  return copy.addedOn(
    new Date(item.dateCreatedMs).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
  )
}

export const instantMixLabel = (seed: LibraryItem): string => {
  if (seed.type === 'Audio') {
    return primaryArtistName(seed.artists, seed.name) || seed.name
  }
  return seed.name
}

export const instantMixCardTitle = (
  seed: LibraryItem | undefined,
  copy: HomeMixCopy = defaultHomeMixCopy,
): string => {
  if (!seed) return copy.instantMix
  return copy.mixDot(instantMixLabel(seed))
}

export const favoritesMixTitle = (
  copy: HomeMixCopy = defaultHomeMixCopy,
): string => copy.favoritesMix

export const isNumberedMixTitle = (title: string): boolean =>
  /^mix\s*\d+$/i.test(title.trim())

/** Don't split genre labels on apostrophes. */
export const titleCaseGenreLabel = (label: string): string => {
  const trimmed = label.trim()
  if (!trimmed) return ''
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s\-/&])([a-z])/g, (_, sep: string, char: string) => sep + char.toUpperCase())
}

export const seededMixTitle = (
  seedLabel: string,
  copy: HomeMixCopy = defaultHomeMixCopy,
): string => {
  const label = seedLabel.trim()
  if (!label || isNumberedMixTitle(label)) return ''
  if (/\bmix$/i.test(label)) return label
  return copy.mixNamed(label)
}

/** Cached "AC Mix" from splitting AC/DC. Do not expand collab credits. */
const restoreSlashBandSeed = (
  seedLabel: string,
  tracks: readonly LibraryItem[],
): string => {
  const seed = seedLabel.trim()
  if (!seed || isNumberedMixTitle(seed)) return seed
  const prefix = `${seed.toLowerCase()}/`
  for (const track of tracks) {
    const name = primaryArtistName(track.artists)
    if (
      name.length > seed.length &&
      name.toLowerCase().startsWith(prefix) &&
      !isCollabArtistName(name)
    ) {
      return name
    }
  }
  return seed
}

const artistCountsFromTracks = (
  tracks: readonly LibraryItem[],
  exclude: ReadonlySet<string> = new Set(),
): readonly { name: string; count: number; order: number }[] => {
  const counts = new Map<string, { name: string; count: number; order: number }>()
  for (const track of tracks) {
    const name = primaryArtistName(track.artists)
    if (!name) continue
    const key = name.toLowerCase()
    if (exclude.has(key)) continue
    const prev = counts.get(key)
    counts.set(key, {
      name: prev?.name ?? name,
      count: (prev?.count ?? 0) + 1,
      order: prev?.order ?? counts.size,
    })
  }
  return [...counts.values()].toSorted(
    (a, b) => b.count - a.count || a.order - b.order,
  )
}

export const topArtistsFromTracks = (
  tracks: readonly LibraryItem[],
  limit = 3,
  exclude: ReadonlySet<string> = new Set(),
): readonly string[] =>
  artistCountsFromTracks(tracks, exclude)
    .slice(0, limit)
    .map((entry) => entry.name)

/**
 * Prefer the listening seed when it is still (co-)dominant. Otherwise name from
 * the dominant track artist so daily Instant Mix refreshes stay honest.
 * Pass `forceSeed` for genre Instant Mixes (tracks often omit genre tags).
 */
export const resolveHomeMixNamingSeed = (
  seedLabel: string,
  tracks: readonly LibraryItem[],
  options?: { readonly forceSeed?: boolean },
): string => {
  const restored = restoreSlashBandSeed(seedLabel, tracks).trim()
  if (restored && !isNumberedMixTitle(restored)) {
    if (options?.forceSeed) return restored
    const seedKey = restored.toLowerCase()
    const ranked = artistCountsFromTracks(tracks)
    const seedCount =
      ranked.find((entry) => entry.name.toLowerCase() === seedKey)?.count ?? 0
    if (seedCount > 0 && seedCount === (ranked[0]?.count ?? 0)) return restored
  }
  const top = artistCountsFromTracks(tracks)[0]?.name
  if (top) return top
  const genre = tracks.map((track) => track.genres?.[0]?.trim()).find(Boolean)
  return genre ? titleCaseGenreLabel(genre) : ''
}

export const homeMixCardTitle = (
  seedLabel: string,
  tracks: readonly LibraryItem[],
  copy: HomeMixCopy = defaultHomeMixCopy,
  options?: { readonly forceSeed?: boolean },
): string => {
  const naming = resolveHomeMixNamingSeed(seedLabel, tracks, options)
  return seededMixTitle(naming, copy) || copy.yourMix
}

export const homeMixCardSubtitle = (
  seedLabel: string,
  tracks: readonly LibraryItem[],
  copy: HomeMixCopy = defaultHomeMixCopy,
): string => {
  const seed = restoreSlashBandSeed(seedLabel, tracks).trim().toLowerCase()
  const exclude =
    seed && !isNumberedMixTitle(seed) ? new Set([seed]) : new Set<string>()
  const withoutSeed = topArtistsFromTracks(tracks, 3, exclude)
  const names =
    withoutSeed.length >= 2 ? withoutSeed : topArtistsFromTracks(tracks, 3)
  if (names.length === 0) return copy.madeForYou
  if (names.length === 1) return names[0] ?? copy.madeForYou
  if (names.length === 2) {
    return copy.artistsTwo(names[0] ?? '', names[1] ?? '')
  }
  return copy.artistsThreeAndMore(
    names[0] ?? '',
    names[1] ?? '',
    names[2] ?? '',
  )
}

/** Recover the mix seed from a cached English card title for re-localization. */
export const mixSeedLabelFromCachedTitle = (
  title: string,
  copy: HomeMixCopy = defaultHomeMixCopy,
): string => {
  const trimmed = title.trim()
  if (
    !trimmed ||
    trimmed === copy.yourMix ||
    trimmed === defaultHomeMixCopy.yourMix
  ) {
    return ''
  }
  if (isNumberedMixTitle(trimmed)) return trimmed
  if (/\bmix$/i.test(trimmed)) {
    return trimmed.replace(/\s+mix$/i, '').trim()
  }
  return trimmed
}

export const displayHomeMixCard = <
  T extends {
    readonly id?: string
    readonly title: string
    readonly subtitle: string
    readonly tracks: readonly LibraryItem[]
  },
>(
  mix: T,
  copy: HomeMixCopy = defaultHomeMixCopy,
): Pick<T, 'title' | 'subtitle'> => {
  const cachedSeed = mixSeedLabelFromCachedTitle(mix.title, copy)
  const namingSeed = resolveHomeMixNamingSeed(cachedSeed, mix.tracks, {
    forceSeed: Boolean(mix.id?.startsWith('genre:')),
  })
  return {
    title: seededMixTitle(namingSeed, copy) || copy.yourMix,
    subtitle: homeMixCardSubtitle(namingSeed, mix.tracks, copy),
  }
}

export const HOME_INSTANT_MIX_TARGET = 6
export const HOME_INSTANT_MIX_SEED_ATTEMPTS = 12
export const HOME_MIX_FETCH_CONCURRENCY = 6
export const HOME_GENRE_PREVIEW_LIMIT = 32
export const HOME_GENRE_CATALOG_LIMIT = 250
export const HOME_LATEST_ALBUMS_LIMIT = 24
export const HOME_FAVORITE_ARTISTS_LIMIT = 12

/** Newest albums from a local catalog — Home can paint before Jellyfin returns. */
export const latestAlbumsFromCatalog = (
  albums: readonly LibraryItem[],
  limit = HOME_LATEST_ALBUMS_LIMIT,
): readonly LibraryItem[] => {
  if (limit <= 0 || albums.length === 0) return []
  return albums
    .filter((album) => album.type === 'MusicAlbum' && album.id)
    .toSorted(
      (left, right) =>
        (right.dateCreatedMs ?? 0) - (left.dateCreatedMs ?? 0) ||
        left.name.localeCompare(right.name),
    )
    .slice(0, limit)
}

export const likedArtistsFromCatalog = (
  artists: readonly LibraryItem[],
): readonly LibraryItem[] =>
  artists.filter((artist) => artist.type === 'MusicArtist' && artist.isFavorite === true)

export const assembleInstantMixSeeds = (
  {
    rankedArtists,
    recent,
    favorites,
  }: {
    readonly rankedArtists: readonly LibraryItem[]
    readonly recent: readonly LibraryItem[]
    readonly favorites: readonly LibraryItem[]
  },
  limit = HOME_INSTANT_MIX_SEED_ATTEMPTS,
): readonly LibraryItem[] => {
  const out: LibraryItem[] = []
  const seen = new Set<string>()
  for (const artist of rankedArtists) {
    if (!artist.id || seen.has(artist.id)) continue
    seen.add(artist.id)
    const track =
      recent.find((entry) => entry.artistId === artist.id) ??
      favorites.find((entry) => entry.artistId === artist.id)
    out.push(
      track
        ? {
            ...track,
            artistId: artist.id,
            artists: artist.artists.length > 0 ? artist.artists : track.artists,
          }
        : artist,
    )
    if (out.length >= limit) return out
  }
  return out
}

export const rankArtistsFromTracks = (
  tracks: readonly LibraryItem[],
  limit = 12,
): readonly LibraryItem[] => {
  const counts = new Map<
    string,
    { readonly id: string; readonly name: string; readonly count: number }
  >()
  for (const track of tracks) {
    const id = track.artistId?.trim()
    const raw = track.artists.find((name) => name.trim().length > 0)?.trim() ?? ''
    if (!id || isCollabArtistName(raw)) continue
    const name = primaryArtistName(track.artists, 'Artist') || 'Artist'
    const prev = counts.get(id)
    counts.set(id, {
      id,
      name: prev?.name ?? name,
      count: (prev?.count ?? 0) + 1,
    })
  }
  return [...counts.values()]
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: 'MusicArtist',
      artists: [entry.name],
      durationMs: 0,
      imageItemId: entry.id,
    }))
}

export const assembleFavoriteArtists = (
  liked: readonly LibraryItem[],
  ranked: readonly LibraryItem[],
  limit = HOME_FAVORITE_ARTISTS_LIMIT,
): readonly LibraryItem[] => {
  const out: LibraryItem[] = []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  for (const item of [...liked, ...ranked]) {
    if (item.type !== 'MusicArtist' || !item.id || seenIds.has(item.id)) continue
    const label = item.name.trim() || primaryArtistName(item.artists)
    if (isCollabArtistName(label)) continue
    const nameKey = artistNameKey(label)
    if (nameKey && seenNames.has(nameKey)) continue
    seenIds.add(item.id)
    if (nameKey) seenNames.add(nameKey)
    out.push(item)
    if (out.length >= limit) return out
  }
  return out
}

export const downloadsFromOffline = (
  entries: Readonly<Record<string, OfflineEntry>>,
): readonly LibraryItem[] =>
  Object.values(entries)
    .filter((entry) => entry.complete)
    .toSorted((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .map((entry) => ({
      id: entry.itemId,
      name: entry.title,
      type: 'Audio',
      artists: entry.artist ? [entry.artist] : [],
      album: entry.album || undefined,
      durationMs: entry.durationMs,
      imageItemId: entry.itemId,
    }))
