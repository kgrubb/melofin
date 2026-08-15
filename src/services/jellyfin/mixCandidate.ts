import { artistMixSeedLabel, type HomeMixCandidate } from '@/src/domain/homeMixes'
import {
  assembleThemedMix,
  canonicalGenre,
  enrichSeedGenres,
  needsMixDiversityPad,
  themedMixTracks,
} from '@/src/domain/instantMix'
import { assembleListenNow, LISTEN_NOW_MIN } from '@/src/domain/listenNow'
import type { LibraryItem } from '@/src/domain/libraryItem'
import type { Result } from '@/src/domain/result'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  fetchInstantMix,
  fetchInstantMixFromArtist,
  INSTANT_MIX_HOME_LIMIT,
} from '@/src/services/jellyfin/library'

type GenreMixFn = (name: string) => Promise<Result<readonly LibraryItem[]>>

const tracksOf = (
  result: Result<readonly LibraryItem[]> | null | undefined,
): readonly LibraryItem[] => (result?.ok ? result.value : [])

export const buildMixCandidate = async (
  context: JellyfinContext,
  userId: string,
  seed: LibraryItem,
  genreMixByName: GenreMixFn,
  minLength = LISTEN_NOW_MIN,
): Promise<HomeMixCandidate> => {
  const artistId =
    seed.artistId ?? (seed.type === 'MusicArtist' ? seed.id : undefined)
  const mixSeed =
    artistId && seed.artistId !== artistId ? { ...seed, artistId } : seed

  const artistMix = artistId
    ? await fetchInstantMixFromArtist(
        context,
        userId,
        artistId,
        INSTANT_MIX_HOME_LIMIT,
      )
    : null
  const itemMix =
    mixSeed.type === 'Audio' &&
    (!artistMix?.ok || (artistMix.value?.length ?? 0) < minLength)
      ? await fetchInstantMix(
          context,
          userId,
          mixSeed.id,
          INSTANT_MIX_HOME_LIMIT,
        )
      : null

  const rawMix = assembleListenNow(
    [tracksOf(artistMix), tracksOf(itemMix)],
    120,
  )
  const themed = themedMixTracks(mixSeed, rawMix)
  if (!needsMixDiversityPad(themed, minLength)) {
    return {
      id: `instant:${artistId ?? mixSeed.id}`,
      seedLabel: artistMixSeedLabel(mixSeed),
      tracks: themed,
    }
  }

  // Genre pads only when Instant Mix is thin/mono — avoids wasted round-trips.
  const knownGenres = (mixSeed.genres ?? []).slice(0, 3)
  const knownCanon = new Set(
    knownGenres.map(canonicalGenre).filter((key) => key.length > 0),
  )
  const extraNames = enrichSeedGenres(mixSeed, rawMix)
    .filter((name) => {
      const key = canonicalGenre(name)
      return key.length > 0 && !knownCanon.has(key)
    })
    .slice(0, 3)
  const padNames = [...knownGenres, ...extraNames]
  const pads =
    padNames.length > 0
      ? await Promise.all(padNames.map((name) => genreMixByName(name)))
      : []

  return {
    id: `instant:${artistId ?? mixSeed.id}`,
    seedLabel: artistMixSeedLabel(mixSeed),
    tracks: assembleThemedMix(
      mixSeed,
      rawMix,
      pads.flatMap(tracksOf),
      minLength,
      themed,
    ),
  }
}
