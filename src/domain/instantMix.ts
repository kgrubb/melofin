import type { LibraryItem } from '@/src/domain/libraryItem'
import { primaryArtistName } from '@/src/domain/homeFeed'
import {
  assembleListenNow,
  isListenNowTrack,
  LISTEN_NOW_TARGET,
} from '@/src/domain/listenNow'

/** Collapse "Hip-Hop" / "Hip Hop" / "hip_hop" for overlap checks. */
export const normalizeGenre = (genre: string): string =>
  genre
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const CANONICAL_ALIASES: Readonly<Record<string, string>> = {
  rap: 'hiphop',
  hiphop: 'hiphop',
  hiphoprap: 'hiphop',
  traphop: 'hiphop',
  alternativerap: 'hiphop',
  alternativehiphop: 'hiphop',
  electronic: 'electronic',
  electronica: 'electronic',
  edm: 'electronic',
  dance: 'electronic',
  indietronica: 'electronic',
  rnb: 'rnb',
  rhythmandblues: 'rnb',
  soul: 'rnb',
  indierock: 'indie',
  alternativerock: 'rock',
  rock: 'rock',
  garagerock: 'rock',
  softrock: 'rock',
  progressiverock: 'rock',
}

/** Map near-duplicate genre labels into one bucket (Rap ~ Hip Hop). */
export const canonicalGenre = (genre: string): string => {
  const normalized = normalizeGenre(genre)
  if (!normalized) return ''
  if (normalized.includes('psych')) return 'psych'
  return CANONICAL_ALIASES[normalized] ?? normalized
}

export const genreTagSet = (
  genres: readonly string[],
): ReadonlySet<string> =>
  new Set(genres.map(canonicalGenre).filter((tag) => tag.length > 0))

/** Jaccard on genre tags. Null if either side is empty. */
export const jaccardSimilarity = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number | null => {
  if (left.size === 0 || right.size === 0) return null
  const intersection = [...left].reduce(
    (n, tag) => n + (right.has(tag) ? 1 : 0),
    0,
  )
  return intersection / (left.size + right.size - intersection)
}

/** Fraction of track tags that also appear on the seed. */
export const genreRecall = (
  seed: ReadonlySet<string>,
  track: ReadonlySet<string>,
): number | null => {
  if (seed.size === 0 || track.size === 0) return null
  const hits = [...track].reduce((n, tag) => n + (seed.has(tag) ? 1 : 0), 0)
  return hits / track.size
}

export const GENRE_FIT_NEUTRAL = 0.3
export const GENRE_FIT_MIN = 0.4

export const genreFitScore = (
  seedGenres: readonly string[],
  trackGenres: readonly string[],
): number => genreFitScoreAgainst(genreTagSet(seedGenres), trackGenres)

export const genreFitScoreAgainst = (
  seed: ReadonlySet<string>,
  trackGenres: readonly string[],
): number => {
  const track = genreTagSet(trackGenres)
  if (seed.size === 0 || track.size === 0) return GENRE_FIT_NEUTRAL
  return Math.max(
    genreRecall(seed, track) ?? 0,
    jaccardSimilarity(seed, track) ?? 0,
  )
}

export const genresOverlap = (
  left: readonly string[],
  right: readonly string[],
): boolean => (jaccardSimilarity(genreTagSet(left), genreTagSet(right)) ?? 0) > 0

const seedArtistId = (seed: LibraryItem): string => seed.artistId?.trim() ?? ''

const seedArtistNameKey = (seed: LibraryItem): string =>
  primaryArtistName(seed.artists).toLowerCase()

const matchesSeedArtist = (
  artistId: string,
  artistNameKey: string,
  track: LibraryItem,
): boolean => {
  if (artistId && track.artistId === artistId) return true
  return (
    artistNameKey.length > 0 &&
    primaryArtistName(track.artists).toLowerCase() === artistNameKey
  )
}

/** Borrow dominant same-artist tags when the seed has no genres. */
export const enrichSeedGenres = (
  seed: LibraryItem,
  mixTracks: readonly LibraryItem[],
): readonly string[] => {
  if (seed.genres && seed.genres.length > 0) return seed.genres

  const artistId = seedArtistId(seed)
  const artistNameKey = seedArtistNameKey(seed)
  const sameArtist = mixTracks.filter((track) =>
    matchesSeedArtist(artistId, artistNameKey, track),
  )
  const counts = new Map<string, { genre: string; count: number }>()
  for (const track of sameArtist) {
    // Primary tag only. Secondary tags on one row must not widen the lane.
    const primary = (track.genres ?? []).find((genre) => canonicalGenre(genre))
    if (!primary) continue
    const key = canonicalGenre(primary)
    const prev = counts.get(key)
    counts.set(key, {
      genre: prev?.genre ?? primary,
      count: (prev?.count ?? 0) + 1,
    })
  }
  if (sameArtist.length === 0 || counts.size === 0) return []

  // Ignore one-offs (e.g. a single holiday primary among rap rows).
  const minCount =
    sameArtist.length === 1 ? 1 : Math.max(2, Math.ceil(sameArtist.length / 2))
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count)
  const dominant = ranked.filter((entry) => entry.count >= minCount)
  return (dominant.length > 0 ? dominant : ranked.slice(0, 1)).map(
    (entry) => entry.genre,
  )
}

export const filterInstantMixTracks = (
  seed: LibraryItem,
  tracks: readonly LibraryItem[],
): readonly LibraryItem[] => {
  const seedGenres = enrichSeedGenres(seed, tracks)
  const seedTags = genreTagSet(seedGenres)
  const genreSeed = seed.type === 'MusicGenre'
  const artistId = seedArtistId(seed)
  const artistNameKey = seedArtistNameKey(seed)

  const scored = tracks
    .filter(isListenNowTrack)
    .flatMap((track, index) => {
      const tags = track.genres ?? []
      const score = matchesSeedArtist(artistId, artistNameKey, track)
        ? 1
        : // Keep untagged neighbors when the seed already has genres.
          tags.length === 0 && (genreSeed || seedTags.size > 0)
          ? 1
          : genreFitScoreAgainst(seedTags, tags)
      return score >= GENRE_FIT_MIN ? [{ track, index, score }] : []
    })
  scored.sort(
    (left, right) => right.score - left.score || left.index - right.index,
  )
  return scored.map((entry) => entry.track)
}

export const mixArtistKey = (track: LibraryItem): string => {
  const id = track.artistId?.trim()
  if (id) return `id:${id}`
  const name = primaryArtistName(track.artists).toLowerCase()
  return name ? `name:${name}` : `track:${track.id}`
}

/** Soft cap ~1/10 of target per artist. */
export const mixArtistCap = (target = LISTEN_NOW_TARGET): number =>
  Math.max(2, Math.ceil(target / 10))

/** Tighter ~1/12 cap for the seed artist. */
export const mixSeedArtistCap = (target = LISTEN_NOW_TARGET): number =>
  Math.max(2, Math.ceil(target / 12))

export const MIX_MIN_DISTINCT_ARTISTS = 3
export const MIX_MAX_DOMINANT_SHARE = 0.45

const playableTracks = (tracks: readonly LibraryItem[]): readonly LibraryItem[] =>
  tracks.filter(isListenNowTrack)

export const distinctArtistCount = (tracks: readonly LibraryItem[]): number =>
  new Set(playableTracks(tracks).map(mixArtistKey)).size

export const dominantArtistShare = (tracks: readonly LibraryItem[]): number => {
  const playable = playableTracks(tracks)
  if (playable.length === 0) return 0
  const counts = playable.reduce<Map<string, number>>((acc, track) => {
    const key = mixArtistKey(track)
    acc.set(key, (acc.get(key) ?? 0) + 1)
    return acc
  }, new Map())
  return Math.max(0, ...counts.values()) / playable.length
}

const mixDiversityStats = (
  playable: readonly LibraryItem[],
): { readonly artists: number; readonly dominantShare: number } => {
  if (playable.length === 0) return { artists: 0, dominantShare: 0 }
  const counts = new Map<string, number>()
  for (const track of playable) {
    const key = mixArtistKey(track)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return {
    artists: counts.size,
    dominantShare: Math.max(0, ...counts.values()) / playable.length,
  }
}

export const isMixDiverseEnough = (
  tracks: readonly LibraryItem[],
  minArtists = MIX_MIN_DISTINCT_ARTISTS,
  maxShare = MIX_MAX_DOMINANT_SHARE,
): boolean => {
  const playable = playableTracks(tracks)
  if (playable.length === 0) return false
  const needed = Math.min(
    minArtists,
    Math.max(2, Math.floor(playable.length / 5)),
  )
  const { artists, dominantShare } = mixDiversityStats(playable)
  return artists >= needed && dominantShare <= maxShare
}

export const needsMixDiversityPad = (
  tracks: readonly LibraryItem[],
  minLength: number,
): boolean => {
  const playable = playableTracks(tracks)
  if (playable.length < minLength) return true
  const needed = Math.min(
    MIX_MIN_DISTINCT_ARTISTS,
    Math.max(2, Math.floor(playable.length / 5)),
  )
  const { artists, dominantShare } = mixDiversityStats(playable)
  return artists < needed || dominantShare > MIX_MAX_DOMINANT_SHARE
}

export type DiversifyMixOptions = {
  readonly seedArtistKey?: string
  readonly seedArtistCap?: number
}

type ArtistBuckets = {
  readonly order: readonly string[]
  readonly tracks: ReadonlyMap<string, readonly LibraryItem[]>
}

const bucketByArtist = (tracks: readonly LibraryItem[]): ArtistBuckets => {
  const order: string[] = []
  const map = new Map<string, LibraryItem[]>()
  for (const track of playableTracks(tracks)) {
    const key = mixArtistKey(track)
    const bucket = map.get(key)
    if (bucket) bucket.push(track)
    else {
      map.set(key, [track])
      order.push(key)
    }
  }
  return { order, tracks: map }
}

/** Round-robin artists. Seed uses a tighter cap. Soften caps only if needed for minPlayable. */
export const diversifyMixTracks = (
  tracks: readonly LibraryItem[],
  target = LISTEN_NOW_TARGET,
  minPlayable = 8,
  perArtistCap = mixArtistCap(target),
  options?: DiversifyMixOptions,
): readonly LibraryItem[] => {
  const seedKey = options?.seedArtistKey
  const seedCap = options?.seedArtistCap ?? mixSeedArtistCap(target)
  const { order: firstSeen, tracks: buckets } = bucketByArtist(tracks)
  const order =
    seedKey && buckets.has(seedKey)
      ? [...firstSeen.filter((key) => key !== seedKey), seedKey]
      : firstSeen

  const cursors = new Map(order.map((key) => [key, 0]))
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  const out: LibraryItem[] = []

  const capFor = (key: string, roundCap: number): number =>
    seedKey && key === seedKey ? Math.min(seedCap, roundCap) : roundCap

  const takeRound = (roundCap: number): boolean => {
    const skipSeen = (bucket: readonly LibraryItem[], c: number): number =>
      c < bucket.length && seen.has(bucket[c]!.id) ? skipSeen(bucket, c + 1) : c

    const step = (index: number, progressed: boolean): boolean => {
      if (index >= order.length || out.length >= target) return progressed
      const key = order[index]!
      if ((counts.get(key) ?? 0) >= capFor(key, roundCap)) {
        return step(index + 1, progressed)
      }
      const bucket = buckets.get(key)
      if (!bucket) return step(index + 1, progressed)
      const cursor = skipSeen(bucket, cursors.get(key) ?? 0)
      cursors.set(key, cursor)
      const next = bucket[cursor]
      if (!next) return step(index + 1, progressed)
      cursors.set(key, cursor + 1)
      seen.add(next.id)
      counts.set(key, (counts.get(key) ?? 0) + 1)
      out.push(next)
      return step(index + 1, true)
    }

    return step(0, false)
  }

  while (out.length < target && takeRound(perArtistCap)) {
    /* soft-cap fill */
  }
  while (out.length < target && takeRound(perArtistCap * 2)) {
    /* relaxed non-seed fill */
  }
  if (out.length >= minPlayable) return out

  return [
    ...out,
    ...playableTracks(tracks).filter((track) => !seen.has(track.id)),
  ].slice(0, Math.max(minPlayable, out.length))
}

const seedArtistOptions = (
  seed: LibraryItem,
): DiversifyMixOptions | undefined => {
  if (seed.type === 'MusicGenre') return undefined
  const key =
    seed.type === 'MusicArtist'
      ? mixArtistKey({
          ...seed,
          artistId: seed.artistId?.trim() || seed.id,
        })
      : mixArtistKey(seed)
  if (key.startsWith('track:')) return undefined
  return { seedArtistKey: key, seedArtistCap: mixSeedArtistCap() }
}

export const themedMixTracks = (
  seed: LibraryItem,
  tracks: readonly LibraryItem[],
  target = LISTEN_NOW_TARGET,
  minPlayable = 8,
): readonly LibraryItem[] =>
  diversifyMixTracks(
    filterInstantMixTracks(seed, tracks),
    target,
    minPlayable,
    mixArtistCap(target),
    seedArtistOptions(seed),
  )

export const themedMixFromPools = (
  seed: LibraryItem,
  pools: readonly (readonly LibraryItem[])[],
  target = LISTEN_NOW_TARGET,
  minPlayable = 8,
): readonly LibraryItem[] =>
  themedMixTracks(
    seed,
    assembleListenNow(pools, Math.max(target * 3, 160)),
    target,
    minPlayable,
  )

/** Pad with genre neighbors only when still thin/mono. */
export const assembleThemedMix = (
  seed: LibraryItem,
  rawMix: readonly LibraryItem[],
  genrePads: readonly LibraryItem[],
  minLength: number,
  prethemed?: readonly LibraryItem[],
): readonly LibraryItem[] => {
  const themed = prethemed ?? themedMixTracks(seed, rawMix)
  return needsMixDiversityPad(themed, minLength)
    ? themedMixFromPools(seed, [themed, genrePads])
    : themed
}

export const listeningGenreNames = (
  tracks: readonly LibraryItem[],
): readonly string[] => {
  const seen = new Set<string>()
  return tracks.flatMap((track) =>
    (track.genres ?? []).flatMap((genre) => {
      const key = canonicalGenre(genre)
      if (!key || seen.has(key)) return []
      seen.add(key)
      return [genre]
    }),
  )
}

export const listeningGenresFromTracks = (
  tracks: readonly LibraryItem[],
  limit = 16,
): readonly LibraryItem[] => {
  const out: LibraryItem[] = []
  const seen = new Set<string>()
  for (const track of tracks) {
    for (const genre of track.genreItems ?? []) {
      const id = genre.id.trim()
      const name = genre.name.trim()
      const key = canonicalGenre(name)
      if (!id || !name || !key || seen.has(id) || seen.has(key)) continue
      seen.add(id)
      seen.add(key)
      out.push({
        id,
        name,
        type: 'MusicGenre',
        artists: [],
        durationMs: 0,
        imageItemId: id,
      })
      if (out.length >= limit) return out
    }
  }
  return out
}

/** First layer wins on canonical name. */
export const foldGenreCatalog = (
  layers: readonly (readonly LibraryItem[])[],
): readonly LibraryItem[] => {
  const out: LibraryItem[] = []
  const seen = new Set<string>()
  for (const layer of layers) {
    for (const genre of layer) {
      const key = canonicalGenre(genre.name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(genre)
    }
  }
  return out
}

export const listeningGenresNeedCatalog = (
  listeningNames: readonly string[],
  tiles: readonly LibraryItem[],
): boolean => {
  if (listeningNames.length === 0) return false
  const have = new Set(
    tiles.map((genre) => canonicalGenre(genre.name)).filter((key) => key.length > 0),
  )
  return listeningNames.some((name) => {
    const key = canonicalGenre(name)
    return key.length > 0 && !have.has(key)
  })
}

/** Prefer listening genres, then the rest of the catalog. */
export const preferListeningGenres = (
  catalog: readonly LibraryItem[],
  listeningNames: readonly string[],
  limit = 16,
): readonly LibraryItem[] => {
  const byKey = new Map<string, LibraryItem>()
  for (const genre of catalog) {
    const key = canonicalGenre(genre.name)
    if (!key || byKey.has(key)) continue
    byKey.set(key, genre)
  }
  if (byKey.size === 0) return []

  const out: LibraryItem[] = []
  const used = new Set<string>()
  for (const name of listeningNames) {
    const key = canonicalGenre(name)
    if (!key || used.has(key)) continue
    const hit = byKey.get(key)
    if (!hit) continue
    used.add(key)
    out.push(hit)
    if (out.length >= limit) return out
  }
  if (listeningNames.length === 0) {
    return catalog.slice(0, limit)
  }
  for (const genre of catalog) {
    const key = canonicalGenre(genre.name)
    if (!key || used.has(key)) continue
    used.add(key)
    out.push(genre)
    if (out.length >= limit) break
  }
  return out
}

export const excludeTrackIds = (
  tracks: readonly LibraryItem[],
  usedIds: ReadonlySet<string>,
): readonly LibraryItem[] =>
  tracks.filter((track) => track.id && !usedIds.has(track.id))

/** Normalize for title dedupe (Hip-Hop vs Hip Hop, keep tokens like "!!!"). */
export const mixTitleKey = (titleOrLabel: string): string => {
  const trimmed = titleOrLabel.trim()
  if (!trimmed) return ''
  return normalizeGenre(trimmed) || trimmed.toLowerCase().replace(/\s+/g, ' ')
}
