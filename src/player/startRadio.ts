import { AUTOPLAY_MIN } from '@/src/domain/autoplay'
import {
  assembleThemedMix,
  enrichSeedGenres,
  needsMixDiversityPad,
  themedMixTracks,
} from '@/src/domain/instantMix'
import type { LibraryItem } from '@/src/domain/libraryItem'
import { logger } from '@/src/logging/logger'
import {
  artworkUrl,
  fetchInstantMix,
  fetchInstantMixFromArtist,
  fetchInstantMixFromGenreName,
  toQueueTrack,
} from '@/src/services/jellyfin/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'

const tracksOf = <T,>(result: { ok: true; value: T } | { ok: false } | null) =>
  result && result.ok ? result.value : []

/**
 * User-initiated Instant Mix radio: replace queue with similar tracks and
 * leave Autoplay session on so the rolling buffer continues.
 */
export const startRadioFromItem = async (
  itemId: string,
  artistId?: string,
): Promise<boolean> => {
  const session = useSessionStore.getState()
  const context = session.context
  const userId = session.session?.userId
  if (!context || !userId || !itemId.trim()) return false

  try {
    const id = itemId.trim()
    const artistMix = artistId
      ? await fetchInstantMixFromArtist(context, userId, artistId)
      : null
    const itemMix =
      !artistMix?.ok || (artistMix.value?.length ?? 0) < AUTOPLAY_MIN
        ? await fetchInstantMix(context, userId, id)
        : null
    const rawMix = [
      ...tracksOf(artistMix),
      ...tracksOf(itemMix),
    ]
    const seedFromMix = rawMix.find((entry) => entry.id === id)
    const seed: LibraryItem = {
      id,
      name: seedFromMix?.name ?? id,
      type: 'Audio',
      artists: seedFromMix?.artists ?? [],
      durationMs: seedFromMix?.durationMs ?? 0,
      artistId: artistId ?? seedFromMix?.artistId,
      genres: seedFromMix?.genres,
    }
    const themed = themedMixTracks(seed, rawMix)
    const genrePads = needsMixDiversityPad(themed, AUTOPLAY_MIN)
      ? await Promise.all(
          enrichSeedGenres(seed, rawMix)
            .slice(0, 3)
            .map((name) => fetchInstantMixFromGenreName(context, userId, name)),
        )
      : []
    const assembled = assembleThemedMix(
      seed,
      rawMix,
      genrePads.flatMap(tracksOf),
      AUTOPLAY_MIN,
      themed,
    )
    if (assembled.length === 0) return false

    const queueTracks = assembled.map((item) =>
      toQueueTrack(
        item,
        artworkUrl(
          context,
          item.imageItemId ?? item.id,
          item.imageTag,
          'hero',
        ),
      ),
    )
    usePlayerStore.getState().playQueue(queueTracks, 0, null, true)
    usePlayerStore.getState().armAutoplaySession(queueTracks.length)
    return true
  } catch (cause) {
    logger.warn('radio.start_failed', { cause: String(cause) })
    return false
  }
}
