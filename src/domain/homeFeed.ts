import type { LibraryItem } from '@/src/domain/libraryItem'
import type { OfflineEntry } from '@/src/domain/offline'

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

export const albumCardSubtitle = (item: LibraryItem): string => {
  const artist = primaryArtistName(item.artists)
  if (artist) return artist
  const album = item.album?.trim()
  if (album) return album
  const n = item.childCount ?? 0
  if (item.type !== 'Audio' && n > 0) return n === 1 ? '1 song' : `${n} songs`
  if (item.type !== 'MusicAlbum' || !item.dateCreatedMs) return ''
  return `Added ${new Date(item.dateCreatedMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`
}

export const instantMixLabel = (seed: LibraryItem): string => {
  if (seed.type === 'Audio') {
    return primaryArtistName(seed.artists, seed.name) || seed.name
  }
  return seed.name
}

export const instantMixCardTitle = (seed: LibraryItem | undefined): string => {
  if (!seed) return 'Instant Mix'
  return `Mix · ${instantMixLabel(seed)}`
}

export const favoritesMixTitle = (): string => 'Favorites mix'

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

export const seededMixTitle = (seedLabel: string): string => {
  const label = seedLabel.trim()
  if (!label || isNumberedMixTitle(label)) return ''
  if (/\bmix$/i.test(label)) return label
  return `${label} Mix`
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

export const topArtistsFromTracks = (
  tracks: readonly LibraryItem[],
  limit = 3,
  exclude: ReadonlySet<string> = new Set(),
): readonly string[] => {
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
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.name)
}

export const homeMixCardTitle = (
  seedLabel: string,
  tracks: readonly LibraryItem[],
): string => {
  const fromSeed = seededMixTitle(restoreSlashBandSeed(seedLabel, tracks))
  if (fromSeed) return fromSeed
  const top = topArtistsFromTracks(tracks, 1)
  if (top[0]) return seededMixTitle(top[0]) || `${top[0]} Mix`
  const genre = tracks.map((track) => track.genres?.[0]?.trim()).find(Boolean)
  if (genre) {
    const cased = titleCaseGenreLabel(genre)
    return seededMixTitle(cased) || `${cased} Mix`
  }
  return 'Your Mix'
}

export const homeMixCardSubtitle = (
  seedLabel: string,
  tracks: readonly LibraryItem[],
): string => {
  const seed = restoreSlashBandSeed(seedLabel, tracks).trim().toLowerCase()
  const exclude =
    seed && !isNumberedMixTitle(seed) ? new Set([seed]) : new Set<string>()
  const withoutSeed = topArtistsFromTracks(tracks, 3, exclude)
  const names =
    withoutSeed.length >= 2 ? withoutSeed : topArtistsFromTracks(tracks, 3)
  if (names.length === 0) return 'Made for you'
  if (names.length === 1) return names[0] ?? 'Made for you'
  if (names.length === 2) return `${names[0]}, ${names[1]}`
  return `${names[0]}, ${names[1]}, ${names[2]} and more`
}

export const HOME_INSTANT_MIX_TARGET = 6
export const HOME_INSTANT_MIX_SEED_ATTEMPTS = 12
export const HOME_MIX_FETCH_CONCURRENCY = 6
export const HOME_GENRE_PREVIEW_LIMIT = 32
export const HOME_GENRE_CATALOG_LIMIT = 250

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
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
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
  limit = 12,
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

export const collageTracks = (
  tracks: readonly LibraryItem[],
  limit = 4,
): readonly LibraryItem[] => {
  const out: LibraryItem[] = []
  const seen = new Set<string>()
  for (const track of tracks) {
    const id = track.imageItemId ?? track.id
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(track)
    if (out.length >= limit) return out
  }
  return out
}

export const collageImageIds = (
  tracks: readonly LibraryItem[],
  limit = 4,
): readonly string[] =>
  collageTracks(tracks, limit).map((track) => track.imageItemId ?? track.id)

export const downloadsFromOffline = (
  entries: Readonly<Record<string, OfflineEntry>>,
): readonly LibraryItem[] =>
  Object.values(entries)
    .filter((entry) => entry.complete)
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .map((entry) => ({
      id: entry.itemId,
      name: entry.title,
      type: 'Audio',
      artists: entry.artist ? [entry.artist] : [],
      album: entry.album || undefined,
      durationMs: entry.durationMs,
      imageItemId: entry.itemId,
    }))
