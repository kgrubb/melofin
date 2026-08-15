import {
  assembleAutoplayBatch,
  AUTOPLAY_MIN,
  AUTOPLAY_REFILL_AT,
  autoplaySeedId,
  excludeIdsForAutoplay,
} from '@/src/domain/autoplay'
import {
  assembleThemedMix,
  enrichSeedGenres,
  needsMixDiversityPad,
  themedMixTracks,
} from '@/src/domain/instantMix'
import type { LibraryItem } from '@/src/domain/libraryItem'
import { currentTrack, nextIndex, upcomingCount } from '@/src/domain/queue'
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

const flight: { current: Promise<boolean> | null } = { current: null }
const goNextFlight: { current: Promise<void> | null } = { current: null }

const tracksOf = <T,>(
  result:
    | { readonly ok: true; readonly value: readonly T[] }
    | { readonly ok: false }
    | null,
): readonly T[] => (result?.ok ? result.value : [])

/** Single-flight Instant Mix refill. True if the queue has a next index. */
export const ensureAutoplayContinuation = async (): Promise<boolean> => {
  if (flight.current) return flight.current

  const run = async (): Promise<boolean> => {
    const store = usePlayerStore.getState()
    if (!store.autoplaySessionOn || store.repeat !== 'off') {
      return nextIndex(store) >= 0
    }
    if (upcomingCount(store) >= AUTOPLAY_REFILL_AT) {
      return nextIndex(store) >= 0
    }

    const session = useSessionStore.getState()
    const context = session.context
    const userId = session.session?.userId
    if (!context || !userId) return nextIndex(usePlayerStore.getState()) >= 0

    const playing = currentTrack(store)
    const seedId = autoplaySeedId({
      queueSourceId: store.queueSource?.id,
      currentTrackId: playing?.id,
      autoplayActive: store.autoplayActive,
      recentTrackIds: store.recentPlayedIds,
    })
    if (!seedId) return nextIndex(usePlayerStore.getState()) >= 0
    const queueGen = store.queueGen

    try {
      const artistId = playing?.artistId
      const artistMix = artistId
        ? await fetchInstantMixFromArtist(context, userId, artistId)
        : null
      const itemMix =
        !artistMix?.ok || (artistMix.value?.length ?? 0) < AUTOPLAY_MIN
          ? await fetchInstantMix(context, userId, seedId)
          : null
      const rawMix = [...tracksOf(artistMix), ...tracksOf(itemMix)]
      const seedFromMix = rawMix.find((entry) => entry.id === seedId)
      const seed: LibraryItem = {
        id: seedId,
        name: playing?.title ?? seedFromMix?.name ?? seedId,
        type: 'Audio',
        artists: playing?.artist
          ? playing.artist.split(',').map((part) => part.trim())
          : seedFromMix?.artists ?? [],
        durationMs: playing?.durationMs ?? seedFromMix?.durationMs ?? 0,
        artistId: artistId ?? seedFromMix?.artistId,
        genres: seedFromMix?.genres,
      }
      const themed = themedMixTracks(seed, rawMix)
      const genrePads = needsMixDiversityPad(themed, AUTOPLAY_MIN)
        ? await Promise.all(
            enrichSeedGenres(seed, rawMix)
              .slice(0, 3)
              .map((name) =>
                fetchInstantMixFromGenreName(context, userId, name),
              ),
          )
        : []
      const latest = usePlayerStore.getState()
      if (
        latest.queueGen !== queueGen ||
        !latest.autoplaySessionOn ||
        latest.repeat !== 'off'
      ) {
        return nextIndex(latest) >= 0
      }
      const assembled = assembleAutoplayBatch(
        [
          assembleThemedMix(
            seed,
            rawMix,
            genrePads.flatMap(tracksOf),
            AUTOPLAY_MIN,
            themed,
          ),
        ],
        excludeIdsForAutoplay(latest.tracks, latest.recentPlayedIds),
      )
      if (assembled.length === 0) {
        return nextIndex(usePlayerStore.getState()) >= 0
      }

      const still = usePlayerStore.getState()
      if (
        still.queueGen !== queueGen ||
        !still.autoplaySessionOn ||
        still.repeat !== 'off'
      ) {
        return nextIndex(still) >= 0
      }

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
      usePlayerStore.getState().appendAutoplayTracks(queueTracks)
      return nextIndex(usePlayerStore.getState()) >= 0
    } catch (cause) {
      logger.warn('autoplay.refill_failed', { cause: String(cause) })
      return nextIndex(usePlayerStore.getState()) >= 0
    }
  }

  flight.current = run().finally(() => {
    flight.current = null
  })
  return flight.current
}

export const isAutoplayRefillInFlight = (): boolean => flight.current != null

/**
 * When at end of queue, refill then advance. Stops if nothing was appended.
 * Single-flight so cast EOF polls / double next cannot skip two tracks.
 */
export const goNextWithAutoplay = async (): Promise<void> => {
  if (goNextFlight.current) return goNextFlight.current

  goNextFlight.current = (async () => {
    const store = usePlayerStore.getState()
    if (nextIndex(store) >= 0) {
      store.goNext()
      return
    }
    const hasNext = await ensureAutoplayContinuation()
    if (hasNext && nextIndex(usePlayerStore.getState()) >= 0) {
      usePlayerStore.getState().goNext()
      return
    }
    usePlayerStore.setState({ isPlaying: false })
  })().finally(() => {
    goNextFlight.current = null
  })

  return goNextFlight.current
}

export const isGoNextWithAutoplayInFlight = (): boolean =>
  goNextFlight.current != null

/** Fire-and-forget near-end refill + gapless prime. */
export const maybeRefillAutoplay = (): void => {
  const store = usePlayerStore.getState()
  if (!store.autoplaySessionOn || store.repeat !== 'off') return
  if (isAutoplayRefillInFlight()) return
  if (upcomingCount(store) >= AUTOPLAY_REFILL_AT) return
  void ensureAutoplayContinuation().then((ok) => {
    if (!ok) return
    void import('@/src/player/nativeQueue').then(({ primeNextTrack }) => {
      void primeNextTrack()
    })
  })
}
