import {
  HOME_INSTANT_MIX_TARGET,
  homeMixCardSubtitle,
  homeMixCardTitle,
  titleCaseGenreLabel,
  primaryArtistName,
} from '@/src/domain/homeFeed'
import {
  diversifyMixTracks,
  excludeTrackIds,
  isMixDiverseEnough,
  mixSeedArtistCap,
  mixTitleKey,
  themedMixTracks,
} from '@/src/domain/instantMix'
import type { LibraryItem } from '@/src/domain/libraryItem'

export const MIX_PLAY_MIN = 4

export const HOME_MIX_MAX_AGE_MS = 24 * 60 * 60 * 1000

export const isHomeMixCacheFresh = (
  savedAtMs: number | undefined,
  nowMs = Date.now(),
): boolean =>
  typeof savedAtMs === 'number' &&
  Number.isFinite(savedAtMs) &&
  savedAtMs > 0 &&
  nowMs - savedAtMs >= 0 &&
  nowMs - savedAtMs < HOME_MIX_MAX_AGE_MS

/** Rebuild unless we already attempted today, or a full rail is still fresh. */
export const shouldRebuildHomeMixes = (
  {
    savedAtMs,
    mixCount,
    attemptedAtMs,
  }: {
    readonly savedAtMs: number | undefined
    readonly mixCount: number
    readonly attemptedAtMs?: number
  },
  nowMs = Date.now(),
): boolean => {
  if (isHomeMixCacheFresh(attemptedAtMs, nowMs)) return false
  if (mixCount >= HOME_INSTANT_MIX_TARGET && isHomeMixCacheFresh(savedAtMs, nowMs)) {
    return false
  }
  return true
}

export type HomeMixCard = {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly tracks: readonly LibraryItem[]
}

export type HomeMixCandidate = {
  readonly id: string
  readonly seedLabel: string
  readonly tracks: readonly LibraryItem[]
}

export type MixFoldState = {
  readonly mixes: readonly HomeMixCard[]
  readonly usedTrackIds: ReadonlySet<string>
  readonly usedTitles: ReadonlySet<string>
}

export const emptyMixFoldState = (): MixFoldState => ({
  mixes: [],
  usedTrackIds: new Set(),
  usedTitles: new Set(),
})

export const pickPlayableMixTracks = (
  tracks: readonly LibraryItem[],
  usedTrackIds: ReadonlySet<string>,
  min = MIX_PLAY_MIN,
): readonly LibraryItem[] => {
  const unique = excludeTrackIds(tracks, usedTrackIds)
  if (unique.length >= min) return unique
  return tracks.length >= min ? tracks : []
}

const seedOptionsForCandidate = (candidate: HomeMixCandidate) => {
  const artistId = candidate.id.startsWith('instant:')
    ? candidate.id.slice('instant:'.length).trim()
    : ''
  if (!artistId) return undefined
  return {
    seedArtistKey: `id:${artistId}`,
    seedArtistCap: mixSeedArtistCap(),
  }
}

export const tryBuildHomeMixCard = (
  candidate: HomeMixCandidate,
  usedTrackIds: ReadonlySet<string>,
  usedTitles: ReadonlySet<string>,
  min = MIX_PLAY_MIN,
): HomeMixCard | null => {
  const excluded = excludeTrackIds(candidate.tracks, usedTrackIds)
  const unique =
    excluded.length >= min
      ? excluded
      : candidate.tracks.length >= min
        ? candidate.tracks
        : []
  if (unique.length < min) return null
  const playable =
    excluded.length === candidate.tracks.length
      ? unique
      : diversifyMixTracks(
          unique,
          undefined,
          min,
          undefined,
          seedOptionsForCandidate(candidate),
        )
  if (playable.length < min || !isMixDiverseEnough(playable)) return null
  const seedLabel = candidate.id.startsWith('genre:')
    ? titleCaseGenreLabel(candidate.seedLabel)
    : candidate.seedLabel
  const title = homeMixCardTitle(seedLabel, playable)
  const titleKey = mixTitleKey(title)
  if (!titleKey || usedTitles.has(titleKey)) return null
  return {
    id: candidate.id,
    title,
    subtitle: homeMixCardSubtitle(seedLabel, playable),
    tracks: playable,
  }
}

export const retitleHomeMixCard = <
  T extends {
    readonly title: string
    readonly subtitle: string
    readonly tracks: readonly LibraryItem[]
  },
>(
  mix: T,
): T => {
  const seed = mix.title.replace(/\s+mix$/i, '').trim()
  if (!seed) return mix
  const title = homeMixCardTitle(seed, mix.tracks)
  if (title === mix.title) return mix
  return { ...mix, title, subtitle: homeMixCardSubtitle(seed, mix.tracks) }
}

export const appendHomeMixCard = (
  state: MixFoldState,
  candidate: HomeMixCandidate,
  target: number,
  min = MIX_PLAY_MIN,
): MixFoldState => {
  if (state.mixes.length >= target) return state
  const card = tryBuildHomeMixCard(
    candidate,
    state.usedTrackIds,
    state.usedTitles,
    min,
  )
  if (!card) return state
  const usedTitles = new Set(state.usedTitles)
  usedTitles.add(mixTitleKey(card.title))
  const usedTrackIds = new Set(state.usedTrackIds)
  for (const track of card.tracks) {
    if (track.id) usedTrackIds.add(track.id)
  }
  return {
    mixes: [...state.mixes, card],
    usedTitles,
    usedTrackIds,
  }
}

export const foldHomeMixCards = (
  artistCandidates: readonly HomeMixCandidate[],
  genreCandidates: readonly HomeMixCandidate[] = [],
  target = HOME_INSTANT_MIX_TARGET,
  min = MIX_PLAY_MIN,
): readonly HomeMixCard[] => {
  const afterArtists = artistCandidates.reduce(
    (state, candidate) => appendHomeMixCard(state, candidate, target, min),
    emptyMixFoldState(),
  )
  if (afterArtists.mixes.length >= target) return afterArtists.mixes
  return genreCandidates.reduce(
    (state, candidate) => appendHomeMixCard(state, candidate, target, min),
    afterArtists,
  ).mixes
}

export const genreMixCandidateTracks = (
  label: string,
  id: string,
  raw: readonly LibraryItem[],
): readonly LibraryItem[] =>
  themedMixTracks(
    {
      id,
      name: label,
      type: 'MusicGenre',
      artists: [],
      durationMs: 0,
      genres: [label],
    },
    raw,
  )

export const artistMixSeedLabel = (seed: LibraryItem): string =>
  primaryArtistName(seed.artists, seed.name) || seed.name

export const dedupeById = <T extends { readonly id: string }>(
  items: readonly T[],
): readonly T[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

/** Serial Home mix upserts. */
export const createMixFoldQueue = (
  target: number,
  onChange: (mixes: readonly HomeMixCard[]) => void,
) => {
  const box: { state: MixFoldState; chain: Promise<void> } = {
    state: emptyMixFoldState(),
    chain: Promise.resolve(),
  }

  const commit = (candidate: HomeMixCandidate): Promise<void> => {
    const apply = () => {
      const next = appendHomeMixCard(box.state, candidate, target)
      if (next === box.state) return
      box.state = next
      onChange(next.mixes)
    }
    box.chain = box.chain.then(apply, apply)
    return box.chain
  }

  return {
    commit,
    flush: () => box.chain,
    snapshot: () => box.state,
  }
}
