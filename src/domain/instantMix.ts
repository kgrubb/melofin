import type { LibraryItem } from '@/src/domain/libraryItem'
import { primaryArtistName } from '@/src/domain/homeFeed'
import {
  assembleListenNow,
  isListenNowTrack,
  LISTEN_NOW_TARGET,
} from '@/src/domain/listenNow'

/** Collapse “Hip-Hop” / “Hip Hop” / “hip_hop” for overlap checks. */
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

/** Map near-duplicate genre labels into one bucket (Rap ≈ Hip Hop). */
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

/** Jaccard similarity on genre tag sets; null when either side is empty. */
export const jaccardSimilarity = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number | null => {
  if (left.size === 0 || right.size === 0) return null
  let intersection = 0
  for (const tag of left) {
    if (right.has(tag)) intersection += 1
  }
  return intersection / (left.size + right.size - intersection)
}

/**
 * Recall of track tags against the seed — “does this track sit in the seed’s lane?”
 * Standard content-based fit when the question is asymmetric (seed → candidate).
 */
export const genreRecall = (
  seed: ReadonlySet<string>,
  track: ReadonlySet<string>,
): number | null => {
  if (seed.size === 0 || track.size === 0) return null
  let hits = 0
  for (const tag of track) {
    if (seed.has(tag)) hits += 1
  }
  return hits / track.size
}

/** Missing tags score below the keep floor — sparse metadata doesn’t auto-admit outliers. */
export const GENRE_FIT_NEUTRAL = 0.3
/** Keep Instant Mix candidates at or above this genre-fit score. */
export const GENRE_FIT_MIN = 0.4

/**
 * Content-based genre fit in [0, 1].
 * Instant Mix retrieves similar artists; this scores whether tags agree.
 */
export const genreFitScore = (
  seedGenres: readonly string[],
  trackGenres: readonly string[],
): number => genreFitScoreAgainst(genreTagSet(seedGenres), trackGenres)

/** Fit against a precomputed seed tag set (hot path for filtering many tracks). */
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

/** When the seed has no genres, borrow dominant tags from same-artist Instant Mix rows. */
export const enrichSeedGenres = (
  seed: LibraryItem,
  mixTracks: readonly LibraryItem[],
): readonly string[] => {
  if (seed.genres && seed.genres.length > 0) return seed.genres

  const artistId = seedArtistId(seed)
  const artistNameKey = seedArtistNameKey(seed)
  const counts = new Map<string, { genre: string; count: number }>()
  let artistTracks = 0
  for (const track of mixTracks) {
    if (!matchesSeedArtist(artistId, artistNameKey, track)) continue
    artistTracks += 1
    // Primary tag only — secondary tags on one row must not widen the lane.
    const primary = (track.genres ?? []).find((genre) => canonicalGenre(genre))
    if (!primary) continue
    const key = canonicalGenre(primary)
    const prev = counts.get(key)
    counts.set(key, {
      genre: prev?.genre ?? primary,
      count: (prev?.count ?? 0) + 1,
    })
  }
  if (artistTracks === 0 || counts.size === 0) return []

  // Ignore one-offs (e.g. a single holiday primary among rap rows).
  const minCount =
    artistTracks === 1 ? 1 : Math.max(2, Math.ceil(artistTracks / 2))
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count)
  const dominant = ranked.filter((entry) => entry.count >= minCount)
  return (dominant.length > 0 ? dominant : ranked.slice(0, 1)).map(
    (entry) => entry.genre,
  )
}

/**
 * Instant Mix = candidate retrieval (similar artists).
 * Genre Jaccard/recall = content filter for homogeneity.
 * Artist soft-cap (later) = diversity within that lane.
 */
export const filterInstantMixTracks = (
  seed: LibraryItem,
  tracks: readonly LibraryItem[],
): readonly LibraryItem[] => {
  const seedGenres = enrichSeedGenres(seed, tracks)
  const seedTags = genreTagSet(seedGenres)
  const genreSeed = seed.type === 'MusicGenre'
  const artistId = seedArtistId(seed)
  const artistNameKey = seedArtistNameKey(seed)

  const scored: { track: LibraryItem; index: number; score: number }[] = []
  let index = 0
  for (const track of tracks) {
    if (!isListenNowTrack(track)) continue
    let score: number
    if (matchesSeedArtist(artistId, artistNameKey, track)) {
      score = 1
    } else {
      const tags = track.genres ?? []
      // Instant Mix is already similarity-scoped; keep untagged neighbors when we
      // have a genre lane (or a genre seed) so artist radios don't collapse.
      score =
        tags.length === 0 && (genreSeed || seedTags.size > 0)
          ? 1
          : genreFitScoreAgainst(seedTags, tags)
    }
    if (score >= GENRE_FIT_MIN) scored.push({ track, index, score })
    index += 1
  }
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

/** Soft cap so one artist can’t own a whole mix (~1/10 of the target). */
export const mixArtistCap = (target = LISTEN_NOW_TARGET): number =>
  Math.max(2, Math.ceil(target / 10))

/** Seed artist stays a guest in “their” radio (~1/12), not the whole show. */
export const mixSeedArtistCap = (target = LISTEN_NOW_TARGET): number =>
  Math.max(2, Math.ceil(target / 12))

export const MIX_MIN_DISTINCT_ARTISTS = 3
/** Reject / re-pad when one artist is more than this share of the mix. */
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

/** Length alone is not enough — mono Instant Mix often clears the old min. */
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

/** Local mutable grouping — pure from the caller’s perspective. */
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

/**
 * Round-robin across artists with a soft cap. Seed artists (when provided) use a
 * tighter cap so Instant Mix “from artist” radios don’t collapse to discography.
 * Only drops caps entirely if the mix would be unplayable.
 */
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
    let progressed = false
    for (const key of order) {
      if (out.length >= target) return progressed
      if ((counts.get(key) ?? 0) >= capFor(key, roundCap)) continue
      const bucket = buckets.get(key)
      if (!bucket) continue
      let cursor = cursors.get(key) ?? 0
      while (cursor < bucket.length && seen.has(bucket[cursor]!.id)) cursor += 1
      cursors.set(key, cursor)
      const next = bucket[cursor]
      if (!next) continue
      cursors.set(key, cursor + 1)
      seen.add(next.id)
      counts.set(key, (counts.get(key) ?? 0) + 1)
      out.push(next)
      progressed = true
    }
    return progressed
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

/**
 * Retrieve (Instant Mix) → genre-fit filter → artist soft-cap diversify.
 * Homogeneous lane, diverse artists — no hard-coded genre blacklists.
 */
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

/** Merge pools, keep seed-coherent rows, then diversify. */
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

/** Theme Instant Mix; pad with genre neighbors only when still thin/mono. */
export const assembleThemedMix = (
  seed: LibraryItem,
  rawMix: readonly LibraryItem[],
  genrePads: readonly LibraryItem[],
  minLength: number,
  /** Pass a precomputed themed list to avoid filtering/diversifying twice. */
  prethemed?: readonly LibraryItem[],
): readonly LibraryItem[] => {
  const themed = prethemed ?? themedMixTracks(seed, rawMix)
  return needsMixDiversityPad(themed, minLength)
    ? themedMixFromPools(seed, [themed, genrePads])
    : themed
}

/** Unique genre labels from recent/favorite listens (preserves first-seen spelling). */
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

/** Genre tiles from recent/favorite GenreItems. */
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

/** True when a listening name is not yet on the painted genre rail. */
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

/** Put genres you actually listen to ahead of alphabetical catalog filler. */
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

/** Drop tracks already used in earlier Home mixes so cards stay more distinct. */
export const excludeTrackIds = (
  tracks: readonly LibraryItem[],
  usedIds: ReadonlySet<string>,
): readonly LibraryItem[] =>
  tracks.filter((track) => track.id && !usedIds.has(track.id))

/**
 * Dedupe key for mix card titles — “Hip-Hop Mix” and “Hip Hop Mix” collide.
 * Uses genre normalization when it yields a token; otherwise a soft lowercase key
 * so artist names like “!!!” still dedupe instead of being dropped.
 */
export const mixTitleKey = (titleOrLabel: string): string => {
  const trimmed = titleOrLabel.trim()
  if (!trimmed) return ''
  return normalizeGenre(trimmed) || trimmed.toLowerCase().replace(/\s+/g, ' ')
}
