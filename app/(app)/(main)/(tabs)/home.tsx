import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated from 'react-native-reanimated'
import { mapPool } from '@/src/domain/asyncPool'
import { uniqueCollageItems } from '@/src/domain/collageArt'
import { uniqueAlbumsFromTracks } from '@/src/domain/genreAlbums'
import { accountScopeKey } from '@/src/domain/accountScope'
import {
  albumCardSubtitle,
  assembleFavoriteArtists,
  assembleInstantMixSeeds,
  assembleMixSeeds,
  downloadsFromOffline,
  HOME_FAVORITE_ARTISTS_LIMIT,
  HOME_GENRE_CATALOG_LIMIT,
  HOME_GENRE_PREVIEW_LIMIT,
  HOME_INSTANT_MIX_SEED_ATTEMPTS,
  HOME_INSTANT_MIX_TARGET,
  HOME_LATEST_ALBUMS_LIMIT,
  HOME_MIX_FETCH_CONCURRENCY,
  latestAlbumsFromCatalog,
  likedArtistsFromCatalog,
  rankArtistsFromTracks,
  titleCaseGenreLabel,
  withArtistsFromTracks,
} from '@/src/domain/homeFeed'
import { homeGreeting, msUntilNextHomeGreeting } from '@/src/domain/homeGreeting'
import {
  createMixFoldQueue,
  dedupeById,
  genreMixCandidateTracks,
  MIX_PLAY_MIN,
  shouldRebuildHomeMixes,
  type HomeMixCard,
} from '@/src/domain/homeMixes'
import { genreTileCovers } from '@/src/domain/browseGenres'
import {
  canonicalGenre,
  foldGenreCatalog,
  albumsMatchingGenre,
  listeningGenreNames,
  listeningGenresFromTracks,
  listeningGenresNeedCatalog,
  preferListeningGenres,
} from '@/src/domain/instantMix'
import type { QueueTrack } from '@/src/domain/queue'
import type { Result } from '@/src/domain/result'
import {
  artworkUrl,
  fetchFavoriteArtists,
  fetchFavoriteTracks,
  fetchGenreArtSamples,
  fetchInstantMixFromGenre,
  fetchInstantMixFromGenreName,
  fetchLatestAlbums,
  fetchMusicGenresPreview,
  fetchRandomSongs,
  fetchRecentPlaylists,
  fetchRecentSongs,
  fetchResume,
  INSTANT_MIX_HOME_LIMIT,
  toQueueTrack,
  userImageUrl,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { createGenreMixCache } from '@/src/services/jellyfin/genreMixCache'
import { buildMixCandidate } from '@/src/services/jellyfin/mixCandidate'
import { useSessionStore } from '@/src/store/session'
import {
  loadPersistedHomeMixes,
  persistHomeMixes,
  useHomeMixesStore,
} from '@/src/store/homeMixes'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSettingsStore } from '@/src/store/settings'
import { AccentGradient } from '@/src/theme/Atmosphere'
import {
  PressableScale,
  miniEntering,
  miniExiting,
  settleEntering,
  useMotionEnabled,
} from '@/src/theme/motion'
import { Artwork } from '@/src/ui/Artwork'
import { MixCollage } from '@/src/ui/MixCollage'
import { EmptyState, ErrorState, Screen } from '@/src/ui/primitives'
import { Icon } from '@/src/ui/Icon'
import { colors, motion, radii, scrollUnderChromePad, spacing } from '@/src/theme/tokens'

const MIX_CARD_W = 168

type HomeMix = HomeMixCard & {
  readonly kind: 'instant'
  readonly icon: string
}

const HomeRail = memo(function HomeRail({
  title,
  items,
  onPressItem,
  artFor,
  artsFor,
  large = false,
  variant = 'album',
}: {
  readonly title: string
  readonly items: readonly LibraryItem[]
  readonly onPressItem: (item: LibraryItem) => void
  readonly artFor: (item: LibraryItem) => string | undefined
  readonly artsFor?: (item: LibraryItem) => readonly (string | undefined)[]
  readonly large?: boolean
  readonly variant?: 'album' | 'artist' | 'genre'
}) {
  const { width } = useWindowDimensions()
  const pad = spacing.md
  const gap = spacing.md
  const circle = variant === 'artist'
  const visible = large ? 2.15 : circle ? 3.35 : 2.4
  const layoutWidth = Math.min(width, 430)
  const card = Math.max(
    circle ? 104 : 132,
    Math.floor((layoutWidth - pad * 2 - gap * Math.floor(visible)) / visible),
  )
  const uniqueItems = dedupeById(items)
  if (uniqueItems.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {uniqueItems.map((entry) => {
          const art = artFor(entry)
          const subtitleText = albumCardSubtitle(entry)
          const showSubtitle = variant === 'album' && Boolean(subtitleText)

          if (variant === 'genre') {
            const genreName = titleCaseGenreLabel(entry.name) || entry.name
            const arts = artsFor?.(entry) ?? [art]
            return (
              <PressableScale
                key={entry.id}
                onPress={() => onPressItem(entry)}
                accessibilityRole="button"
                accessibilityLabel={genreName}
                scaleTo={motion.scale.card}
                style={[styles.card, { width: card }]}
              >
                <View style={[styles.genreArt, { width: card, height: card }]}>
                  <MixCollage arts={arts} size={card} radius={0} recyclingKey={entry.id} />
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
                    locations={[0.42, 1]}
                    style={styles.genreScrim}
                  />
                  <View pointerEvents="none" style={styles.genreLabelWrap}>
                    <Text
                      style={styles.genreLabel}
                      numberOfLines={2}
                      allowFontScaling={false}
                    >
                      {genreName}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            )
          }

          return (
            <PressableScale
              key={entry.id}
              onPress={() => onPressItem(entry)}
              accessibilityRole="button"
              accessibilityLabel={entry.name}
              scaleTo={motion.scale.card}
              style={[styles.card, { width: card }]}
            >
              <Artwork
                uri={art}
                recyclingKey={entry.id}
                style={[
                  styles.art,
                  { width: card, height: card },
                  circle ? styles.artCircle : null,
                ]}
              />
              <Text
                style={[styles.cardTitle, circle ? styles.cardTitleCenter : null]}
                numberOfLines={circle ? 2 : 1}
              >
                {entry.name}
              </Text>
              {showSubtitle ? (
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {subtitleText}
                </Text>
              ) : null}
            </PressableScale>
          )
        })}
      </ScrollView>
    </View>
  )
})

const ActionChip = ({
  label,
  icon,
  primary,
  busy,
  disabled,
  onPress,
}: {
  readonly label: string
  readonly icon: string
  readonly primary?: boolean
  readonly busy?: boolean
  readonly disabled?: boolean
  readonly onPress: () => void
}) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ busy: Boolean(busy), disabled: Boolean(disabled || busy) }}
    disabled={disabled || busy}
    scaleTo={motion.scale.button}
    onPress={onPress}
    style={styles.chipPress}
  >
    {primary ? (
      <AccentGradient style={styles.chipPrimary}>
        <Icon name={icon} tintColor={colors.onAccent} size={16} />
        <Text style={[styles.chipPrimaryLabel, busy ? styles.chipBusyLabel : null]}>
          {label}
        </Text>
      </AccentGradient>
    ) : (
      <View style={[styles.chipSecondary, disabled ? styles.chipDisabled : null]}>
        <Icon name={icon} tintColor={colors.text} size={16} />
        <Text style={[styles.chipSecondaryLabel, busy ? styles.chipBusyLabel : null]}>
          {label}
        </Text>
      </View>
    )}
  </PressableScale>
)

const HomeGreeting = () => {
  const enabled = useMotionEnabled()
  const seen = useRef(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const handle: { timer?: ReturnType<typeof setTimeout> } = {}
    const tick = () => setNow(new Date())
    const arm = () => {
      if (handle.timer) clearTimeout(handle.timer)
      handle.timer = setTimeout(() => {
        tick()
        arm()
      }, msUntilNextHomeGreeting(new Date()))
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      tick()
      arm()
    })
    arm()
    return () => {
      if (handle.timer) clearTimeout(handle.timer)
      sub.remove()
    }
  }, [])
  const text = homeGreeting(now)
  const animate = seen.current && enabled
  seen.current = true
  return (
    <View
      style={styles.greetingWrap}
      accessibilityRole="header"
      accessibilityLabel={text}
    >
      <Animated.Text
        key={text}
        entering={miniEntering(animate)}
        exiting={miniExiting(animate)}
        style={styles.greeting}
        allowFontScaling={false}
        accessible={false}
      >
        {text}
      </Animated.Text>
    </View>
  )
}

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const offlineIndex = useSettingsStore((s) => s.offlineIndex)
  const [albums, setAlbums] = useState<readonly LibraryItem[]>([])
  const [resume, setResume] = useState<readonly LibraryItem[]>([])
  const [playlists, setPlaylists] = useState<readonly LibraryItem[]>([])
  const [favorites, setFavorites] = useState<readonly LibraryItem[]>([])
  const [favoriteArtists, setFavoriteArtists] = useState<readonly LibraryItem[]>([])
  const [genres, setGenres] = useState<readonly LibraryItem[]>([])
  const [genreArtById, setGenreArtById] = useState<
    Readonly<Record<string, readonly LibraryItem[]>>
  >({})
  const [homeMixes, setHomeMixes] = useState<readonly HomeMix[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mixesPending, setMixesPending] = useState(false)
  const [catalogPending, setCatalogPending] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [profileFailed, setProfileFailed] = useState(false)
  const motionOn = useMotionEnabled()
  const loadGenRef = useRef(0)
  const paintedUserRef = useRef<string | null>(null)
  const mixesSavedAtRef = useRef<number | undefined>(undefined)
  const mixesCountRef = useRef(0)
  const mixesAttemptedAtRef = useRef<number | undefined>(undefined)
  const loadInFlightRef = useRef(false)
  const genreArtStartedRef = useRef(new Set<string>())

  useEffect(() => {
    setProfileFailed(false)
  }, [session?.serverUrl, session?.userId])

  const downloads = useMemo(
    () => downloadsFromOffline(offlineIndex.entries),
    [offlineIndex.entries],
  )

  const toHeroTracks = useCallback(
    (items: readonly LibraryItem[]): readonly QueueTrack[] =>
      items.map((entry) =>
        toQueueTrack(
          entry,
          context
            ? artworkUrl(
                context,
                entry.imageItemId ?? entry.albumId ?? entry.id,
                entry.imageTag,
                'hero',
              )
            : undefined,
        ),
      ),
    [context],
  )

  const playShuffled = useCallback(
    (tracks: readonly QueueTrack[], autoplay = false) => {
      if (tracks.length === 0) return
      playQueue(tracks, 0, null, true)
      if (autoplay) usePlayerStore.getState().armAutoplaySession(tracks.length)
    },
    [playQueue],
  )

  const load = useCallback(async () => {
    const clearRails = () => {
      setAlbums([])
      setResume([])
      setPlaylists([])
      setFavorites([])
      setFavoriteArtists([])
      setGenres([])
      setGenreArtById({})
      genreArtStartedRef.current = new Set()
      setHomeMixes([])
      useHomeMixesStore.getState().clear()
      mixesSavedAtRef.current = undefined
      mixesCountRef.current = 0
      mixesAttemptedAtRef.current = undefined
    }
    if (!context || !session) {
      loadGenRef.current += 1
      loadInFlightRef.current = false
      paintedUserRef.current = null
      setLoading(false)
      setMixesPending(false)
      setCatalogPending(false)
      setError(null)
      clearRails()
      return
    }
    const loadGen = ++loadGenRef.current
    const isCurrent = () => loadGenRef.current === loadGen
    loadInFlightRef.current = true
    const scopeKey = accountScopeKey({
      serverUrl: session.serverUrl,
      userId: session.userId,
    })

    if (paintedUserRef.current !== scopeKey) {
      clearRails()
      setMixesPending(false)
      setError(null)
      setLoading(true)
    }
    const cachedP =
      paintedUserRef.current !== scopeKey
        ? loadPersistedHomeMixes(session.serverUrl, session.userId).then(
            (cached) => {
              if (!isCurrent()) return cached
              mixesSavedAtRef.current = cached.savedAt
              mixesAttemptedAtRef.current = cached.attemptedAt
              mixesCountRef.current = cached.mixes.length
              if (cached.mixes.length === 0) return cached
              const restored = cached.mixes.map(
                (mix): HomeMix => ({
                  ...mix,
                  kind: 'instant',
                }),
              )
              setHomeMixes((prev) => (prev.length > 0 ? prev : restored))
              if (Object.keys(useHomeMixesStore.getState().byId).length === 0) {
                useHomeMixesStore.getState().setMixes(restored)
              }
              return cached
            },
          )
        : Promise.resolve(null)
    const gate = { cancelled: false }
    try {
      const library = useLibraryStore.getState()
      if (paintedUserRef.current !== scopeKey) {
        const seedAlbums = latestAlbumsFromCatalog(
          library.albums,
          HOME_LATEST_ALBUMS_LIMIT,
        )
        const seedArtists = assembleFavoriteArtists(
          likedArtistsFromCatalog(library.artists),
          [],
          HOME_FAVORITE_ARTISTS_LIMIT,
        )
        if (seedAlbums.length > 0) setAlbums(seedAlbums)
        if (seedArtists.length > 0) setFavoriteArtists(seedArtists)
        if (seedAlbums.length > 0 || seedArtists.length > 0) {
          paintedUserRef.current = scopeKey
          setLoading(false)
        }
      }

      const recentP = fetchRecentSongs(context, session.userId, 80)
      const favoritesP = fetchFavoriteTracks(context, session.userId)
      const likedArtistsP = fetchFavoriteArtists(context, session.userId, 24)
      const resumeP = fetchResume(context, session.userId)
      const albumsP = fetchLatestAlbums(context, session.userId)
      const playlistsP = fetchRecentPlaylists(context, session.userId)
      const genresP = fetchMusicGenresPreview(
        context,
        session.userId,
        HOME_GENRE_PREVIEW_LIMIT,
      )

      const listenTracksBox: { current: readonly LibraryItem[] } = { current: [] }
      const likedArtistsBox: { current: readonly LibraryItem[] } = {
        current: likedArtistsFromCatalog(library.artists),
      }
      const paintFavoriteArtists = () => {
        if (!isCurrent() || gate.cancelled) return
        const next = assembleFavoriteArtists(
          likedArtistsBox.current,
          rankArtistsFromTracks(listenTracksBox.current, 16),
          HOME_FAVORITE_ARTISTS_LIMIT,
        )
        setFavoriteArtists(next)
        if (next.length === 0) return
        paintedUserRef.current = scopeKey
        setLoading(false)
      }
      void albumsP.then((result) => {
        if (!isCurrent() || gate.cancelled || !result.ok) return
        setAlbums(withArtistsFromTracks(result.value, listenTracksBox.current))
        paintedUserRef.current = scopeKey
        setLoading(false)
      })
      void likedArtistsP.then((result) => {
        if (!isCurrent() || gate.cancelled || !result.ok) return
        likedArtistsBox.current = result.value
        paintFavoriteArtists()
      })

      const [recent, f, likedArtists, resumeEarly] = await Promise.all([
        recentP,
        favoritesP,
        likedArtistsP,
        resumeP,
      ])
      if (!isCurrent()) return

      const nextFavorites = f.ok ? f.value.slice(0, 40) : []
      const nextRecent = recent.ok ? recent.value : []
      const nextResume = resumeEarly.ok ? resumeEarly.value : []
      const audioResume = nextResume.filter((entry) => entry.type === 'Audio')
      const listenTracks = [...nextRecent, ...nextFavorites]
      listenTracksBox.current = listenTracks
      if (likedArtists.ok) likedArtistsBox.current = likedArtists.value
      const listenedGenreNames = listeningGenreNames(listenTracks)
      const genresFromTracks = listeningGenresFromTracks(listenTracks, 16)
      const genresBox = {
        current: preferListeningGenres(
          genresFromTracks,
          listenedGenreNames,
          16,
        ),
      }

      const listenFailed =
        !recent.ok && !f.ok && !likedArtists.ok && !resumeEarly.ok

      setResume(nextResume)
      setFavorites(nextFavorites)
      paintFavoriteArtists()
      setAlbums((prev) =>
        prev.length > 0 ? withArtistsFromTracks(prev, listenTracks) : prev,
      )
      if (genresBox.current.length > 0) setGenres(genresBox.current)
      paintedUserRef.current = scopeKey
      setCatalogPending(true)
      setLoading(false)
      if (!listenFailed) setError(null)

      const live = () => isCurrent() && !gate.cancelled
      void playlistsP.then((result) => {
        if (!live() || !result.ok) return
        setPlaylists(result.value)
      })
      void genresP.then((result) => {
        if (!live()) return
        const preview = result.ok ? result.value : []
        genresBox.current = preferListeningGenres(
          foldGenreCatalog([preview, genresFromTracks]),
          listenedGenreNames,
          16,
        )
        if (genresBox.current.length > 0) setGenres(genresBox.current)
        if (!listeningGenresNeedCatalog(listenedGenreNames, genresBox.current)) {
          return
        }
        void fetchMusicGenresPreview(
          context,
          session.userId,
          HOME_GENRE_CATALOG_LIMIT,
          { enableImages: false },
        ).then((more) => {
          if (!live() || !more.ok) return
          genresBox.current = preferListeningGenres(
            foldGenreCatalog([preview, more.value, genresFromTracks]),
            listenedGenreNames,
            16,
          )
          if (genresBox.current.length > 0) setGenres(genresBox.current)
        })
      })
      void Promise.allSettled([albumsP, playlistsP, genresP]).then(() => {
        if (isCurrent()) setCatalogPending(false)
      })

      const cached = await cachedP
      if (!isCurrent()) return
      if (cached) {
        mixesSavedAtRef.current = cached.savedAt
        mixesAttemptedAtRef.current = cached.attemptedAt
        mixesCountRef.current = Math.max(mixesCountRef.current, cached.mixes.length)
      }
      if (listenFailed && mixesCountRef.current === 0) {
        const failed = [recent, f, resumeEarly, likedArtists].find((row) => !row.ok)
        if (failed && !failed.ok) setError(failed.error.message)
        return
      }
      if (
        !shouldRebuildHomeMixes({
          savedAtMs: mixesSavedAtRef.current,
          mixCount: mixesCountRef.current,
          attemptedAtMs: mixesAttemptedAtRef.current,
        })
      ) {
        return
      }

      setMixesPending(true)

      const rankedForMixes = rankArtistsFromTracks(
        [...nextRecent, ...nextFavorites, ...audioResume],
        HOME_INSTANT_MIX_SEED_ATTEMPTS,
      )
      const rankedSeeds = assembleInstantMixSeeds(
        {
          rankedArtists: rankedForMixes,
          recent: nextRecent,
          favorites: nextFavorites,
        },
        HOME_INSTANT_MIX_SEED_ATTEMPTS,
      )
      const seeds =
        rankedSeeds.length > 0
          ? rankedSeeds
          : assembleMixSeeds(
              [...nextRecent, ...nextFavorites, ...audioResume],
              HOME_INSTANT_MIX_SEED_ATTEMPTS,
            )

      const genreMixByName = createGenreMixCache(context, session.userId)
      const toHomeMix = (card: HomeMixCard): HomeMix => ({
        ...card,
        kind: 'instant',
        icon: 'shuffle',
      })

      const foldQueue = createMixFoldQueue(HOME_INSTANT_MIX_TARGET, (mixes) => {
        if (!isCurrent() || gate.cancelled) return
        const mapped = mixes.map(toHomeMix)
        startTransition(() => {
          setHomeMixes((prev) => (prev.length > mapped.length ? prev : mapped))
        })
        const newest = mapped[mapped.length - 1]
        if (newest) useHomeMixesStore.getState().upsertMix(newest)
      })
      const mixRailFull = () =>
        foldQueue.snapshot().mixes.length >= HOME_INSTANT_MIX_TARGET

      const mixesWork = mapPool(
        seeds,
        HOME_MIX_FETCH_CONCURRENCY,
        async (seed) => {
          try {
            if (gate.cancelled || !isCurrent() || mixRailFull()) return
            const candidate = await buildMixCandidate(
              context,
              session.userId,
              seed,
              genreMixByName,
            )
            if (!gate.cancelled && isCurrent()) await foldQueue.commit(candidate)
          } catch {
            /* keep painting other seeds */
          }
        },
        {
          shouldContinue: () =>
            !gate.cancelled && isCurrent() && !mixRailFull(),
        },
      )

      await mixesWork
      await foldQueue.flush()
      if (!isCurrent() || gate.cancelled) {
        gate.cancelled = true
        return
      }

      const painted = foldQueue.snapshot().mixes
      if (painted.length > 0) mixesCountRef.current = painted.length
      if (painted.length < HOME_INSTANT_MIX_TARGET) {
        const need = HOME_INSTANT_MIX_TARGET - painted.length
        type GenreJob = {
          readonly key: string
          readonly label: string
          readonly id: string
          readonly run: () => Promise<Result<readonly LibraryItem[]>>
        }
        const seen = new Set<string>()
        const jobs: GenreJob[] = []
        const pushJob = (job: GenreJob, limit: number) => {
          if (jobs.length >= limit || !job.key || seen.has(job.key)) return
          seen.add(job.key)
          jobs.push(job)
        }
        for (const name of listenedGenreNames) {
          pushJob(
            {
              key: canonicalGenre(name),
              label: name,
              id: `name:${canonicalGenre(name)}`,
              run: () => genreMixByName(name),
            },
            need + 2,
          )
        }
        for (const genre of genresBox.current) {
          pushJob(
            {
              key: canonicalGenre(genre.name),
              label: genre.name,
              id: genre.id,
              run: () =>
                fetchInstantMixFromGenre(
                  context,
                  session.userId,
                  genre.id,
                  INSTANT_MIX_HOME_LIMIT,
                ).then((byId) =>
                  byId.ok && byId.value.length >= MIX_PLAY_MIN
                    ? byId
                    : fetchInstantMixFromGenreName(
                        context,
                        session.userId,
                        genre.name,
                        INSTANT_MIX_HOME_LIMIT,
                      ),
                ),
            },
            need + 4,
          )
        }
        const genreJobs = jobs.slice(0, Math.max(need * 2, need))

        await mapPool(
          genreJobs,
          HOME_MIX_FETCH_CONCURRENCY,
          async (job) => {
            try {
              if (gate.cancelled || !isCurrent() || mixRailFull()) return
              const mix = await job.run()
              if (!gate.cancelled && isCurrent()) {
                await foldQueue.commit({
                  id: `genre:${job.id}`,
                  seedLabel: job.label,
                  tracks: genreMixCandidateTracks(
                    job.label,
                    job.id,
                    mix.ok ? mix.value : [],
                  ),
                })
              }
            } catch {
              /* skip */
            }
          },
          {
            shouldContinue: () =>
              !gate.cancelled && isCurrent() && !mixRailFull(),
          },
        )
        await foldQueue.flush()
      }

      if (!isCurrent() || gate.cancelled) {
        gate.cancelled = true
        return
      }
      const finalMixes = dedupeById(foldQueue.snapshot().mixes).map(toHomeMix)
      mixesAttemptedAtRef.current = Date.now()
      if (finalMixes.length > 0) {
        const savedAt = Date.now()
        mixesSavedAtRef.current = savedAt
        mixesCountRef.current = finalMixes.length
        mixesAttemptedAtRef.current = savedAt
        setHomeMixes(finalMixes)
        useHomeMixesStore.getState().setMixes(finalMixes)
        void persistHomeMixes(session.serverUrl, session.userId, finalMixes, savedAt)
      }
    } catch {
      gate.cancelled = true
      if (!isCurrent()) return
      if (paintedUserRef.current !== scopeKey) {
        setHomeMixes([])
        useHomeMixesStore.getState().clear()
      }
    } finally {
      if (isCurrent()) {
        loadInFlightRef.current = false
        setLoading(false)
        setMixesPending(false)
      }
    }
  }, [context, session])

  useEffect(() => {
    void load()
  }, [load])

  const skipResumeFocusRefresh = useRef(true)
  const refreshStaleMixes = useCallback(() => {
    if (loadInFlightRef.current) return
    if (
      !shouldRebuildHomeMixes({
        savedAtMs: mixesSavedAtRef.current,
        mixCount: mixesCountRef.current,
        attemptedAtMs: mixesAttemptedAtRef.current,
      })
    ) {
      return
    }
    loadInFlightRef.current = true
    void load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      if (!context || !session) return
      if (skipResumeFocusRefresh.current) {
        skipResumeFocusRefresh.current = false
        return
      }
      const focusGen = loadGenRef.current
      void (async () => {
        const result = await fetchResume(context, session.userId)
        if (loadGenRef.current !== focusGen) return
        if (result.ok) setResume(result.value)
      })()
      refreshStaleMixes()
    }, [context, session, refreshStaleMixes]),
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      refreshStaleMixes()
    })
    return () => sub.remove()
  }, [refreshStaleMixes])

  const artFor = useCallback(
    (entry: LibraryItem) => {
      const offlineArt = offlineIndex.entries[entry.id]?.artworkPath
      if (offlineArt) return offlineArt
      return context
        ? artworkUrl(
            context,
            entry.imageItemId ?? entry.albumId ?? entry.id,
            entry.imageTag,
            'thumb',
          )
        : undefined
    },
    [context, offlineIndex.entries],
  )

  const mixCollageArts = useMemo(() => {
    const occupied = new Set<string>()
    const byId: Record<string, readonly (string | undefined)[]> = {}
    for (const mix of homeMixes) {
      const items = uniqueCollageItems(
        [...uniqueAlbumsFromTracks(mix.tracks), ...albums, ...mix.tracks],
        4,
        occupied,
      )
      byId[mix.id] = items.map(artFor)
    }
    return byId
  }, [albums, artFor, homeMixes])
  const artsForGenre = useCallback(
    (genre: LibraryItem) => {
      const covers = genreTileCovers(
        [
          ...(genreArtById[genre.id] ?? []),
          ...albumsMatchingGenre(albums, genre.name),
        ],
        genre,
      )
      return covers.map(artFor)
    },
    [albums, artFor, genreArtById],
  )

  useEffect(() => {
    if (!context || !session || genres.length === 0) return
    const todo = genres.filter(
      (genre) => genre.id && !genreArtStartedRef.current.has(genre.id),
    )
    if (todo.length === 0) return
    for (const genre of todo) genreArtStartedRef.current.add(genre.id)
    const userId = session.userId
    void (async () => {
      const found: Record<string, readonly LibraryItem[]> = {}
      await mapPool(todo, 4, async (genre) => {
        const samples = await fetchGenreArtSamples(context, session.userId, genre)
        if (samples.length === 0) return
        found[genre.id] = samples
      })
      if (useSessionStore.getState().session?.userId !== userId) return
      if (Object.keys(found).length === 0) return
      setGenreArtById((prev) => ({ ...prev, ...found }))
    })()
  }, [context, session, genres])

  const openItem = useCallback((
    entry: LibraryItem,
    opts?: { readonly resume?: boolean },
  ) => {
    if (entry.type === 'Audio') {
      const offlineArt = offlineIndex.entries[entry.id]?.artworkPath
      const startMs =
        opts?.resume && entry.playbackPositionMs && entry.playbackPositionMs > 0
          ? entry.playbackPositionMs
          : 0
      playQueue(
        [
          toQueueTrack(
            entry,
            offlineArt ??
              (context
                ? artworkUrl(
                    context,
                    entry.imageItemId ?? entry.id,
                    entry.imageTag,
                    'hero',
                  )
                : undefined),
          ),
        ],
        0,
        null,
        undefined,
        startMs,
      )
      return
    }
    if (entry.type === 'MusicAlbum') {
      router.push(`/(app)/(main)/album/${entry.id}`)
      return
    }
    if (entry.type === 'MusicArtist') {
      router.push(`/(app)/(main)/artist/${entry.id}`)
      return
    }
    if (
      entry.type === 'MusicGenre' ||
      entry.type === 'Genre' ||
      genres.some((genre) => genre.id === entry.id)
    ) {
      router.push({
        pathname: '/(app)/(main)/genre/[id]',
        params: { id: entry.id, name: entry.name },
      })
      return
    }
    router.push(`/(app)/(main)/playlist/${entry.id}`)
  }, [context, genres, offlineIndex.entries, playQueue, router])

  const openGenre = useCallback((entry: LibraryItem) => {
    router.push({
      pathname: '/(app)/(main)/genre/[id]',
      params: { id: entry.id, name: entry.name },
    })
  }, [router])

  const shuffleLibrary = async () => {
    if (!context || !session || busy) return
    setBusy('library')
    try {
      const result = await fetchRandomSongs(context, session.userId, 100)
      if (!result.ok || result.value.length === 0) return
      playShuffled(toHeroTracks(result.value))
    } finally {
      setBusy(null)
    }
  }

  const shuffleFavorites = async () => {
    if (!context || !session || busy) return
    setBusy('favorites')
    try {
      const result = await fetchFavoriteTracks(context, session.userId)
      if (!result.ok || result.value.length === 0) return
      playShuffled(toHeroTracks(result.value), true)
    } finally {
      setBusy(null)
    }
  }

  const shuffleDownloads = () => {
    if (busy || downloads.length === 0) return
    playShuffled(
      downloads.map((entry) =>
        toQueueTrack(entry, offlineIndex.entries[entry.id]?.artworkPath),
      ),
    )
  }

  const openMix = (mix: HomeMix) => {
    router.push(`/(app)/(main)/mix/${encodeURIComponent(mix.id)}`)
  }

  const shuffleMix = (mix: HomeMix) => {
    const tracks = toHeroTracks(mix.tracks)
    if (tracks.length === 0) return
    playQueue(
      tracks,
      Math.floor(Math.random() * tracks.length),
      { kind: 'mix', id: mix.id },
      true,
    )
  }

  const empty =
    resume.length === 0 &&
    homeMixes.length === 0 &&
    albums.length === 0 &&
    playlists.length === 0 &&
    favorites.length === 0 &&
    favoriteArtists.length === 0 &&
    genres.length === 0 &&
    downloads.length === 0

  const profileUrl =
    context && session && !profileFailed
      ? userImageUrl(context, session.userId, undefined, 'thumb')
      : undefined

  const continueItems = useMemo(
    () => resume.filter((entry) => (entry.playbackPositionMs ?? 0) > 0),
    [resume],
  )

  const topBar = (
    <View style={styles.header}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Profile and settings"
        scaleTo={motion.scale.button}
        onPress={() => router.push('/(app)/settings')}
        style={styles.avatarPress}
        hitSlop={8}
      >
        {profileUrl ? (
          <Image
            source={{ uri: profileUrl }}
            style={styles.avatar}
            contentFit="cover"
            recyclingKey={
              session
                ? accountScopeKey({
                    serverUrl: session.serverUrl,
                    userId: session.userId,
                  })
                : undefined
            }
            onError={() => setProfileFailed(true)}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {(session?.userName ?? '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
      </PressableScale>
      <HomeGreeting />
    </View>
  )

  const showEmpty = empty && !loading && !mixesPending && !catalogPending
  const showError = Boolean(error) && showEmpty

  return (
    <Screen padBottom={false} padHorizontal={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: scrollUnderChromePad(insets.bottom) },
        ]}
      >
        <View style={styles.lead}>
          {topBar}
          {!showError && !showEmpty ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              <ActionChip
                label="Shuffle"
                icon="shuffle"
                primary
                busy={busy === 'library'}
                onPress={() => void shuffleLibrary()}
              />
              <ActionChip
                label="Favorites"
                icon="heart.fill"
                busy={busy === 'favorites'}
                onPress={() => void shuffleFavorites()}
              />
              <ActionChip
                label="Downloads"
                icon="arrow.down.circle.fill"
                disabled={downloads.length === 0}
                onPress={shuffleDownloads}
              />
            </ScrollView>
          ) : null}
        </View>

        {showError && error ? (
          <View style={styles.padded}>
            <ErrorState message={error} onRetry={() => void load()} />
          </View>
        ) : showEmpty ? (
          <View style={styles.padded}>
            <EmptyState title="Nothing here" message="Add music on your Jellyfin server." />
          </View>
        ) : (
          <>
            {homeMixes.length > 0 ? (
              <Animated.View entering={settleEntering(motionOn)} style={styles.section}>
                <Text style={styles.sectionTitle}>Your Mixes</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {homeMixes.map((mix) => {
                    const arts = mixCollageArts[mix.id] ?? []
                    return (
                      <PressableScale
                        key={mix.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${mix.title}. ${mix.subtitle}`}
                        scaleTo={motion.scale.card}
                        onPress={() => openMix(mix)}
                        style={[styles.mixCard, { width: MIX_CARD_W }]}
                      >
                        <View style={styles.mixArtWrap}>
                          <MixCollage arts={arts} size={MIX_CARD_W} radius={radii.cover} recyclingKey={mix.id} />
                          <PressableScale
                            accessibilityRole="button"
                            accessibilityLabel={`Shuffle play ${mix.title}`}
                            scaleTo={motion.scale.button}
                            hitSlop={8}
                            onPress={(event) => {
                              event.stopPropagation()
                              shuffleMix(mix)
                            }}
                            style={styles.mixBadgePress}
                          >
                            <AccentGradient style={styles.mixBadge}>
                              <Icon name={mix.icon} tintColor={colors.onAccent} size={14} />
                            </AccentGradient>
                          </PressableScale>
                        </View>
                        <Text style={styles.mixTitle} numberOfLines={2}>
                          {mix.title}
                        </Text>
                        <Text style={styles.mixSubtitle} numberOfLines={1}>
                          {mix.subtitle}
                        </Text>
                      </PressableScale>
                    )
                  })}
                </ScrollView>
              </Animated.View>
            ) : mixesPending ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Mixes</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {Array.from({ length: HOME_INSTANT_MIX_TARGET }, (_, index) => (
                    <View
                      key={`mix-skel-${index}`}
                      style={[styles.mixCard, { width: MIX_CARD_W }]}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <View style={[styles.mixArtWrap, styles.mixSkeletonArt]} />
                      <View style={styles.mixSkeletonLine} />
                      <View style={[styles.mixSkeletonLine, styles.mixSkeletonLineShort]} />
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <HomeRail
              title="Your Favorite Artists"
              items={favoriteArtists}
              onPressItem={openItem}
              artFor={artFor}
              variant="artist"
            />

            {continueItems.length > 0 ? (
              <HomeRail
                title="Continue Listening"
                items={continueItems}
                onPressItem={(entry) => openItem(entry, { resume: true })}
                artFor={artFor}
                large
              />
            ) : null}

            <HomeRail
              title="Recently Added"
              items={albums}
              onPressItem={openItem}
              artFor={artFor}
            />

            <HomeRail
              title="Explore Your Genres"
              items={genres}
              onPressItem={openGenre}
              artFor={artFor}
              artsFor={artsForGenre}
              variant="genre"
            />

            <HomeRail
              title="Playlists"
              items={playlists}
              onPressItem={openItem}
              artFor={artFor}
            />
            <HomeRail
              title="Favorites"
              items={favorites}
              onPressItem={openItem}
              artFor={artFor}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  padded: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  avatarPress: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.elevated,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
  },
  avatarInitial: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 18,
  },
  greetingWrap: {
    flex: 1,
    height: 34,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  greeting: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.text,
  },
  scroll: {
    gap: spacing.xl,
    paddingTop: spacing.xs,
    alignItems: 'stretch',
  },
  lead: {
    alignSelf: 'stretch',
  },
  chipRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipPress: {
    flexShrink: 0,
  },
  chipPrimary: {
    minHeight: 34,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipPrimaryLabel: {
    color: colors.onAccent,
    fontWeight: '700',
    fontSize: 13,
    flexShrink: 0,
  },
  chipBusyLabel: {
    opacity: 0.72,
  },
  chipSecondary: {
    minHeight: 34,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipSecondaryLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
    flexShrink: 0,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.text,
    paddingHorizontal: spacing.md,
  },
  rail: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-start',
  },
  card: {
    gap: 8,
  },
  art: {
    borderRadius: radii.cover,
    backgroundColor: colors.surface,
  },
  artCircle: {
    borderRadius: 999,
  },
  genreArt: {
    borderRadius: radii.cover,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
  },
  genreScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  genreLabelWrap: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    height: 44,
    justifyContent: 'flex-start',
  },
  genreLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: -0.1,
  },
  cardTitleCenter: {
    textAlign: 'center',
  },
  cardSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: -4,
  },
  mixCard: {
    gap: 8,
  },
  mixArtWrap: {
    position: 'relative',
    width: MIX_CARD_W,
    height: MIX_CARD_W,
    overflow: 'hidden',
    borderRadius: radii.cover,
  },
  mixBadgePress: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  mixBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mixTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: -0.1,
  },
  mixSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: -2,
  },
  mixSkeletonArt: {
    borderRadius: radii.cover,
    backgroundColor: colors.elevated,
  },
  mixSkeletonLine: {
    height: 12,
    borderRadius: 4,
    backgroundColor: colors.elevated,
    marginTop: 2,
  },
  mixSkeletonLineShort: {
    width: '62%',
  },
})
