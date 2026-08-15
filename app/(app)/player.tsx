import { Image } from 'expo-image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useNavigation, useRouter, type Href } from 'expo-router'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useCastStore } from '@/src/cast/castStore'
import { setActiveVolume, startDiscovery } from '@/src/cast/router'
import {
  DOCK_REVEAL_PROGRESS,
  SHEET_HANDOFF_FADE_MS,
} from '@/src/player/nowPlayingGeometry'
import { isSleepArmed, remainingMs, SLEEP_PRESETS_MINUTES } from '@/src/domain/sleepTimer'
import {
  sanitizeLyricsPayload,
  type LyricsPayload,
} from '@/src/domain/lyrics'
import { toggleFavoriteItem } from '@/src/services/jellyfin/favoriteToggle'
import { fetchLyrics, resizeArtworkUrl } from '@/src/services/jellyfin/library'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { Glass, GlassCluster } from '@/src/theme/Glass'
import { IconButton, PressableScale } from '@/src/theme/motion'
import { AppErrorBoundary } from '@/src/ui/AppErrorBoundary'
import { Icon } from '@/src/ui/Icon'
import { LyricsPanel } from '@/src/ui/LyricsPanel'
import { presentTrackActions } from '@/src/ui/PlaylistActions'
import { ScrubBar } from '@/src/ui/ProgressBar'
import { colors, motion, radii, spacing, typography } from '@/src/theme/tokens'
import { useSettingsStore } from '@/src/store/settings'
import { readJsonFile } from '@/src/storage/jsonFile'

const DISMISS_DISTANCE = motion.sheet.dismissDistance
const DISMISS_PROGRESS = motion.sheet.dismissProgress
const DISMISS_VELOCITY = motion.sheet.dismissVelocity
const SHEET_SPRING = motion.spring.sheet
const SHEET_OPEN_TIMING = {
  duration: motion.duration.sheet,
  easing: Easing.bezier(0.32, 0.72, 0, 1),
} as const

const SHEET_CLOSE_TIMING = {
  duration: Math.round(motion.duration.sheet * 0.85),
  easing: Easing.bezier(0.4, 0, 0.2, 1),
} as const

const PlayerProgress = ({ durationMs }: { readonly durationMs: number }) => {
  const positionMs = usePlayerStore((s) => s.positionMs)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const seekTo = usePlayerStore((s) => s.seekTo)
  return (
    <ScrubBar
      positionMs={positionMs}
      durationMs={durationMs}
      isPlaying={isPlaying}
      onSeek={seekTo}
    />
  )
}

export default function PlayerScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const allowRemove = useRef(false)
  const dockRevealed = useRef(false)

  const track = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.tracks[s.currentIndex] : undefined,
  )
  const heroArt = resizeArtworkUrl(track?.artworkUrl, 'hero')
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const autoplaySessionOn = usePlayerStore((s) => s.autoplaySessionOn)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat)
  const toggleAutoplaySession = usePlayerStore((s) => s.toggleAutoplaySession)
  const goPrevious = usePlayerStore((s) => s.goPrevious)
  const goNext = usePlayerStore((s) => s.goNext)
  const togglePlaying = usePlayerStore((s) => s.togglePlaying)
  const setNowPlayingOpen = usePlayerStore((s) => s.setNowPlayingOpen)
  const sleep = usePlayerStore((s) => s.sleep)
  const setSleepMinutes = usePlayerStore((s) => s.setSleepMinutes)
  const setSleepEndOfTrack = usePlayerStore((s) => s.setSleepEndOfTrack)
  const clearSleep = usePlayerStore((s) => s.clearSleep)
  const activeOutput = useCastStore((s) => s.transfer.active)
  const volumeSupported = useCastStore((s) => s.volumeSupported)
  const volume = useCastStore((s) => s.volume)
  const setSheetOpen = useCastStore((s) => s.setSheetOpen)
  const libraryArtists = useLibraryStore((s) => s.artists)
  const libraryAlbums = useLibraryStore((s) => s.albums)
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const offlineLyricsPath = useSettingsStore(
    (s) => (track ? s.offlineIndex.entries[track.id]?.lyricsPath : undefined),
  )
  const [nowTick, setNowTick] = useState(() => Date.now())
  const pendingHref = useRef<Href | null>(null)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null)
  const [lyricsStatus, setLyricsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'empty' | 'error'
  >('idle')
  /** Square art sized to the smaller of the hero slot’s width/height. */
  const [artSide, setArtSide] = useState(0)

  useEffect(() => {
    if (!isSleepArmed(sleep) || sleep.deadlineMs === null) return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sleep])

  useEffect(() => {
    setLyricsOpen(false)
    setLyrics(null)
    setLyricsStatus('idle')
  }, [track?.id])

  useEffect(() => {
    if (!heroArt || heroArt.startsWith('file:') || heroArt.startsWith('/')) return
    void Image.prefetch(heroArt, 'disk')
  }, [heroArt])

  useEffect(() => {
    if (!lyricsOpen || !track) return
    let cancelled = false
    const load = async () => {
      setLyricsStatus('loading')
      if (offlineLyricsPath) {
        const relative = offlineLyricsPath
        const cached = await readJsonFile<LyricsPayload>(relative)
        if (cancelled) return
        if (cached.ok && cached.value && cached.value.lines.length > 0) {
          const cleaned = sanitizeLyricsPayload(cached.value)
          if (cleaned.lines.length > 0) {
            setLyrics(cleaned)
            setLyricsStatus('ready')
            return
          }
        }
      }
      if (!context) {
        setLyrics(null)
        setLyricsStatus('empty')
        return
      }
      const result = await fetchLyrics(context, track.id)
      if (cancelled) return
      if (!result.ok) {
        setLyrics(null)
        setLyricsStatus('error')
        return
      }
      const cleaned = sanitizeLyricsPayload(result.value)
      if (cleaned.lines.length === 0) {
        setLyrics(cleaned)
        setLyricsStatus('empty')
        return
      }
      setLyrics(cleaned)
      setLyricsStatus('ready')
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [lyricsOpen, track, context, offlineLyricsPath])

  const progress = useSharedValue(reduceMotion ? 1 : 0)
  const screenH = useSharedValue(height)
  const dragOrigin = useSharedValue(1)
  const closing = useSharedValue(false)
  const dockRevealSV = useSharedValue(0)
  const sheetOpacity = useSharedValue(1)

  useEffect(() => {
    screenH.value = height
  }, [height, screenH])

  useEffect(() => {
    setNowPlayingOpen(true)
    dockRevealed.current = false
    dockRevealSV.value = 0
    sheetOpacity.value = 1
    return () => setNowPlayingOpen(false)
  }, [dockRevealSV, setNowPlayingOpen, sheetOpacity])

  useEffect(() => {
    progress.value = reduceMotion ? 1 : withTiming(1, SHEET_OPEN_TIMING)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open on mount
  }, [reduceMotion])

  const revealDock = useCallback(() => {
    if (dockRevealed.current) return
    dockRevealed.current = true
    setNowPlayingOpen(false)
  }, [setNowPlayingOpen])

  const coverDock = useCallback(() => {
    dockRevealed.current = false
    dockRevealSV.value = 0
    sheetOpacity.value = 1
    setNowPlayingOpen(true)
  }, [dockRevealSV, setNowPlayingOpen, sheetOpacity])

  const finishDismiss = useCallback(() => {
    revealDock()
    // Let the drawer finish fading over the live mini player before the route pops.
    setTimeout(() => {
      allowRemove.current = true
      const href = pendingHref.current
      pendingHref.current = null
      if (router.canGoBack()) router.back()
      else router.replace('/(app)/(main)/(tabs)/home')
      if (href) {
        // Push after the modal finishes leaving so collection opens under chrome.
        setTimeout(() => {
          router.push(href)
        }, 16)
      }
    }, SHEET_HANDOFF_FADE_MS)
  }, [revealDock, router])

  const animateClosed = useCallback(() => {
    if (closing.value) return
    closing.value = true
    if (reduceMotion) {
      sheetOpacity.value = 0
      finishDismiss()
      return
    }
    progress.value = withTiming(0, SHEET_CLOSE_TIMING, (finished) => {
      if (finished) {
        runOnJS(finishDismiss)()
        return
      }
      closing.value = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values
  }, [finishDismiss, reduceMotion])

  const openAfterDismiss = useCallback(
    (href: Href) => {
      pendingHref.current = href
      animateClosed()
    },
    [animateClosed],
  )

  const openArtist = useCallback(() => {
    if (!track) return
    const artistId =
      track.artistId ??
      libraryArtists.find((artist) => {
        const primary = track.artist.split(',')[0]?.trim()
        return primary != null && artist.name === primary
      })?.id
    if (!artistId) return
    openAfterDismiss(`/(app)/(main)/artist/${artistId}`)
  }, [libraryArtists, openAfterDismiss, track])

  const openAlbum = useCallback(() => {
    if (!track?.album) return
    const albumId =
      track.albumId ??
      libraryAlbums.find((album) => album.name === track.album)?.id
    if (!albumId) return
    openAfterDismiss(`/(app)/(main)/album/${albumId}`)
  }, [libraryAlbums, openAfterDismiss, track])

  useAnimatedReaction(
    () => progress.value,
    (p) => {
      if (!closing.value) return
      if (p > DOCK_REVEAL_PROGRESS) return
      if (dockRevealSV.value === 1) return
      dockRevealSV.value = 1
      sheetOpacity.value = withTiming(0, {
        duration: SHEET_HANDOFF_FADE_MS,
        easing: Easing.out(Easing.quad),
      })
      runOnJS(revealDock)()
    },
    [revealDock],
  )

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (event) => {
      if (allowRemove.current) return
      event.preventDefault()
      animateClosed()
    })
    return unsub
  }, [animateClosed, navigation])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (allowRemove.current) return false
      animateClosed()
      return true
    })
    return () => sub.remove()
  }, [animateClosed])

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-24, 24])
    .onStart(() => {
      if (!closing.value) dragOrigin.value = progress.value
    })
    .onUpdate((e) => {
      if (closing.value) return
      progress.value = Math.min(
        1,
        Math.max(0, dragOrigin.value - e.translationY / DISMISS_DISTANCE),
      )
      if (progress.value < DOCK_REVEAL_PROGRESS && dockRevealSV.value !== 1) {
        dockRevealSV.value = 1
        sheetOpacity.value = withTiming(0, {
          duration: SHEET_HANDOFF_FADE_MS,
          easing: Easing.out(Easing.quad),
        })
        runOnJS(revealDock)()
      }
    })
    .onEnd((e) => {
      if (closing.value) return
      if (progress.value < DISMISS_PROGRESS || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(animateClosed)()
        return
      }
      runOnJS(coverDock)()
      progress.value = withSpring(1, SHEET_SPRING)
    })

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.55], Extrapolation.CLAMP),
  }))

  /** Vertical sheet dismiss — never non-uniform scale (no squish). */
  const sheetStyle = useAnimatedStyle(() => {
    const p = progress.value
    return {
      flex: 1,
      borderTopLeftRadius: interpolate(p, [0, 1], [radii.xl, 0], Extrapolation.CLAMP),
      borderTopRightRadius: interpolate(p, [0, 1], [radii.xl, 0], Extrapolation.CLAMP),
      overflow: 'hidden' as const,
      opacity: sheetOpacity.value,
      transform: [
        {
          translateY: interpolate(
            p,
            [0, 1],
            [screenH.value, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    }
  })

  if (!track) {
    return (
      <View
        style={styles.root}
        accessibilityViewIsModal
        accessibilityLabel="Now Playing"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={animateClosed} />
        <View style={[styles.emptySheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.empty}>Nothing playing</Text>
        </View>
      </View>
    )
  }

  const resolvedArtistId =
    track.artistId ??
    libraryArtists.find((artist) => {
      const primary = track.artist.split(',')[0]?.trim()
      return primary != null && artist.name === primary
    })?.id
  const resolvedAlbumId =
    track.albumId ??
    (track.album
      ? libraryAlbums.find((album) => album.name === track.album)?.id
      : undefined)

  const sleepArmed = isSleepArmed(sleep)
  const sleepRemaining = remainingMs(sleep, nowTick)
  const sleepLabel = sleep.endOfTrack
    ? 'End'
    : sleepArmed
      ? `${Math.max(1, Math.ceil(sleepRemaining / 60_000))}m`
      : null

  const openSleepMenu = () => {
    presentTrackActions('Sleep timer', [
      ...SLEEP_PRESETS_MINUTES.map((minutes) => ({
        text: `${minutes} minutes`,
        onPress: () => setSleepMinutes(minutes),
      })),
      { text: 'End of track', onPress: () => setSleepEndOfTrack() },
      ...(sleepArmed
        ? [{ text: 'Turn off timer', style: 'destructive' as const, onPress: () => clearSleep() }]
        : []),
    ])
  }

  const onToggleFavorite = () => {
    if (!context || !session || !track) {
      Alert.alert('Sign in required', 'Sign in to manage favorites.')
      return
    }
    void toggleFavoriteItem({
      context,
      userId: session.userId,
      itemId: track.id,
      currentlyFavorite: Boolean(track.isFavorite),
    })
  }

  return (
    <>
    <GestureHandlerRootView
      style={styles.root}
      accessibilityViewIsModal
      accessibilityLabel="Now Playing"
    >
      <AppErrorBoundary fallbackTitle="Player error">
        <View style={styles.root}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
          <Pressable
            accessibilityLabel="Dismiss player"
            style={StyleSheet.absoluteFill}
            onPress={animateClosed}
          />

          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.sheet, sheetStyle]}>
              <View
                style={[
                  styles.expanded,
                  {
                    paddingTop: Math.max(insets.top, spacing.sm),
                    paddingBottom: Math.max(insets.bottom, spacing.lg),
                  },
                ]}
              >
                <View style={styles.handleRow}>
                  <View style={styles.handle} />
                </View>

                <View style={styles.body}>
                  <View style={styles.hero}>
                    <View
                      style={styles.artSlot}
                      onLayout={(event) => {
                        const { width: slotW, height: slotH } = event.nativeEvent.layout
                        const next = Math.floor(Math.max(0, Math.min(slotW, slotH)))
                        setArtSide((prev) => (prev === next ? prev : next))
                      }}
                    >
                      <View
                        style={[
                          styles.artWrap,
                          artSide > 0 ? { width: artSide, height: artSide } : null,
                        ]}
                      >
                        {lyricsOpen ? (
                          <LyricsPanel
                            lyrics={lyrics}
                            status={
                              lyricsStatus === 'idle' || lyricsStatus === 'loading'
                                ? 'loading'
                                : lyricsStatus === 'ready'
                                  ? 'ready'
                                  : lyricsStatus === 'error'
                                    ? 'error'
                                    : 'empty'
                            }
                            reduceMotion={Boolean(reduceMotion)}
                          />
                        ) : heroArt ? (
                          <Image
                            source={{
                              uri: heroArt,
                              cacheKey: `art-hero-${track.id}`,
                            }}
                            style={styles.art}
                            contentFit="cover"
                            cachePolicy="disk"
                            priority="high"
                            allowDownscaling={false}
                            recyclingKey={`art-hero-${track.id}`}
                          />
                        ) : (
                          <View style={[styles.art, styles.artFallback]} />
                        )}
                      </View>
                    </View>

                    <View style={styles.meta}>
                      <Text style={styles.title} numberOfLines={2}>
                        {track.title}
                      </Text>
                      <PressableScale
                        accessibilityRole="link"
                        accessibilityLabel={`Open artist ${track.artist}`}
                        disabled={!resolvedArtistId}
                        onPress={openArtist}
                        scaleTo={0.98}
                        style={styles.metaLink}
                      >
                        <Text style={styles.artist} numberOfLines={1}>
                          {track.artist}
                        </Text>
                      </PressableScale>
                      {track.album ? (
                        <PressableScale
                          accessibilityRole="link"
                          accessibilityLabel={`Open album ${track.album}`}
                          disabled={!resolvedAlbumId}
                          onPress={openAlbum}
                          scaleTo={0.98}
                          style={styles.metaLink}
                        >
                          <Text style={styles.album} numberOfLines={1}>
                            {track.album}
                          </Text>
                        </PressableScale>
                      ) : null}
                      {activeOutput.kind !== 'local' ? (
                        <Text
                          style={styles.playingOn}
                          accessibilityLabel={`Playing on ${activeOutput.name}`}
                          numberOfLines={1}
                        >
                          Playing on {activeOutput.name}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.stage}>
                    <PlayerProgress durationMs={track.durationMs} />
                    <GlassCluster style={styles.accessoryRow} spacing={8}>
                      <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel={
                          track.isFavorite ? 'Unfavorite' : 'Favorite'
                        }
                        scaleTo={motion.scale.button}
                        onPress={onToggleFavorite}
                      >
                        <Glass
                          style={styles.accessoryChip}
                          contentStyle={styles.accessoryInner}
                          isInteractive
                        >
                          <Icon
                            name={track.isFavorite ? 'heart.fill' : 'heart'}
                            tintColor={track.isFavorite ? colors.accent : colors.text}
                            size={20}
                          />
                        </Glass>
                      </PressableScale>
                      {track.hasLyrics !== false ? (
                        <PressableScale
                          accessibilityRole="button"
                          accessibilityLabel={lyricsOpen ? 'Hide lyrics' : 'Show lyrics'}
                          scaleTo={motion.scale.button}
                          onPress={() => setLyricsOpen((open) => !open)}
                        >
                          <Glass
                            style={styles.accessoryChip}
                            contentStyle={styles.accessoryInner}
                            isInteractive
                          >
                            <Icon
                              name="quote.bubble"
                              tintColor={lyricsOpen ? colors.accent : colors.text}
                              size={20}
                            />
                          </Glass>
                        </PressableScale>
                      ) : null}
                      <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel="Sleep timer"
                        scaleTo={motion.scale.button}
                        onPress={openSleepMenu}
                      >
                        <Glass
                          style={styles.accessoryChip}
                          contentStyle={styles.accessoryInner}
                          isInteractive
                        >
                          <Icon
                            name="moon.zzz"
                            tintColor={sleepArmed ? colors.accent : colors.text}
                            size={20}
                          />
                          {sleepLabel ? (
                            <Text style={styles.accessoryLabel}>{sleepLabel}</Text>
                          ) : null}
                        </Glass>
                      </PressableScale>
                    </GlassCluster>
                    {volumeSupported ? (
                      <View style={styles.volumeRow}>
                        <Icon name="speaker.wave.2" size={16} tintColor={colors.textSecondary} />
                        <Pressable
                          accessibilityRole="adjustable"
                          accessibilityLabel="Volume"
                          style={styles.volumeTrack}
                          onPress={(event) => {
                            const width = event.nativeEvent.locationX
                            const next = Math.max(0, Math.min(1, width / 200))
                            void setActiveVolume(next)
                          }}
                        >
                          <View
                            style={[
                              styles.volumeFill,
                              { width: `${Math.round((volume ?? 0.7) * 100)}%` },
                            ]}
                          />
                        </Pressable>
                      </View>
                    ) : null}

                    <View style={styles.dock}>
                      <View style={styles.secondaryRow}>
                        <IconButton accessibilityLabel="Shuffle" onPress={toggleShuffle}>
                          <Icon
                            name="shuffle"
                            tintColor={shuffle ? colors.accent : colors.textSecondary}
                            size={20}
                          />
                        </IconButton>
                        <IconButton accessibilityLabel="Repeat" onPress={cycleRepeat}>
                          <Icon
                            name={repeat === 'one' ? 'repeat.1' : 'repeat'}
                            tintColor={
                              repeat === 'off' ? colors.textSecondary : colors.accent
                            }
                            size={20}
                          />
                        </IconButton>
                        <IconButton
                          accessibilityLabel="Autoplay"
                          onPress={toggleAutoplaySession}
                        >
                          <Icon
                            name="infinity"
                            tintColor={
                              autoplaySessionOn ? colors.accent : colors.textSecondary
                            }
                            size={20}
                          />
                        </IconButton>
                        <IconButton
                          accessibilityLabel="Devices"
                          onPress={() => {
                            startDiscovery()
                            setSheetOpen(true)
                          }}
                        >
                          <Icon
                            name="speaker.wave.2.fill"
                            tintColor={
                              activeOutput.kind !== 'local'
                                ? colors.accent
                                : colors.textSecondary
                            }
                            size={20}
                          />
                        </IconButton>
                        <IconButton
                          accessibilityLabel="Open queue"
                          onPress={() => router.push('/(app)/queue')}
                        >
                          <Icon
                            name="rectangle.stack.fill"
                            tintColor={colors.textSecondary}
                            size={20}
                          />
                        </IconButton>
                      </View>

                      <View style={styles.transport}>
                        <IconButton
                          accessibilityLabel="Previous"
                          onPress={goPrevious}
                          size={56}
                          hitSlop={12}
                        >
                          <Icon name="backward.fill" tintColor={colors.text} size={30} />
                        </IconButton>
                        <PressableScale
                          accessibilityRole="button"
                          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                          onPress={togglePlaying}
                          style={styles.playPress}
                          hitSlop={8}
                        >
                          <AccentGradient style={styles.playButton}>
                            <Icon
                              name={isPlaying ? 'pause.fill' : 'play.fill'}
                              tintColor={colors.onAccent}
                              size={28}
                              weight="semibold"
                            />
                          </AccentGradient>
                        </PressableScale>
                        <IconButton
                          accessibilityLabel="Next"
                          onPress={goNext}
                          size={56}
                          hitSlop={12}
                        >
                          <Icon name="forward.fill" tintColor={colors.text} size={30} />
                        </IconButton>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </AppErrorBoundary>
    </GestureHandlerRootView>
    </>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#05020A',
    pointerEvents: 'none',
  },
  sheet: {
    flex: 1,
    backgroundColor: 'rgba(36, 20, 58, 0.96)',
    borderColor: colors.glassBorder,
  },
  expanded: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    width: '100%',
    flexShrink: 0,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  /** Art + meta shrink; controls stay pinned and never cover metadata. */
  body: {
    flex: 1,
    width: '100%',
    maxWidth: 420,
    minHeight: 0,
    alignSelf: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  hero: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    width: '100%',
    gap: spacing.md,
  },
  artSlot: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artWrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.elevated,
  },
  art: {
    width: '100%',
    height: '100%',
  },
  artFallback: {
    backgroundColor: colors.elevated,
  },
  meta: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    width: '100%',
    alignItems: 'center',
    flexShrink: 0,
  },
  metaLink: {
    maxWidth: '100%',
  },
  title: {
    ...typography.title,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
    textAlign: 'center',
  },
  artist: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
  },
  album: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  playingOn: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  stage: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  accessoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  accessoryChip: {
    borderRadius: radii.pill,
  },
  accessoryInner: {
    minHeight: 40,
    minWidth: 40,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  accessoryLabel: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  volumeTrack: {
    flex: 1,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  volumeFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  dock: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  playPress: {
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySheet: {
    margin: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: 'rgba(28, 14, 48, 0.92)',
    padding: spacing.xl,
  },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
