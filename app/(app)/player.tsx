import { Image } from 'expo-image'
import { useCallback, useEffect, useRef } from 'react'
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useNavigation, useRouter } from 'expo-router'
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
import {
  DOCK_REVEAL_PROGRESS,
  EXPANDED_CONTENT_FADE,
  MINI_CONTENT_FADE,
  SHEET_HANDOFF_FADE_MS,
  expandedPlayerFrame,
  fallbackMiniFrame,
} from '@/src/player/nowPlayingGeometry'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { IconButton, PressableScale } from '@/src/theme/motion'
import { AppErrorBoundary } from '@/src/ui/AppErrorBoundary'
import { Icon } from '@/src/ui/Icon'
import { ScrubBar } from '@/src/ui/ProgressBar'
import { colors, motion, radii, spacing, typography } from '@/src/theme/tokens'

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

const MINI_ART = 44
const MINI_PLAY = 44

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
  const { width, height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const allowRemove = useRef(false)
  const dockRevealed = useRef(false)

  const track = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.tracks[s.currentIndex] : undefined,
  )
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat)
  const goPrevious = usePlayerStore((s) => s.goPrevious)
  const goNext = usePlayerStore((s) => s.goNext)
  const togglePlaying = usePlayerStore((s) => s.togglePlaying)
  const setNowPlayingOpen = usePlayerStore((s) => s.setNowPlayingOpen)
  const measuredMini = usePlayerStore((s) => s.miniPlayerFrame)
  const libraryArtists = useLibraryStore((s) => s.artists)
  const libraryAlbums = useLibraryStore((s) => s.albums)
  const pendingHref = useRef<string | null>(null)

  const from = measuredMini ?? fallbackMiniFrame(width, height, insets.bottom)
  const to = expandedPlayerFrame(width, height, insets.top, insets.bottom)

  const fromX = useSharedValue(from.x)
  const fromY = useSharedValue(from.y)
  const fromW = useSharedValue(from.width)
  const fromH = useSharedValue(from.height)
  const toX = useSharedValue(to.x)
  const toY = useSharedValue(to.y)
  const toW = useSharedValue(to.width)
  const toH = useSharedValue(to.height)

  const progress = useSharedValue(reduceMotion ? 1 : 0)
  const dragOrigin = useSharedValue(1)
  const closing = useSharedValue(false)
  const dockRevealSV = useSharedValue(0)
  const sheetOpacity = useSharedValue(1)

  useEffect(() => {
    fromX.value = from.x
    fromY.value = from.y
    fromW.value = from.width
    fromH.value = from.height
    toX.value = to.x
    toY.value = to.y
    toW.value = to.width
    toH.value = to.height
  }, [
    from.height,
    from.width,
    from.x,
    from.y,
    fromH,
    fromW,
    fromX,
    fromY,
    to.height,
    to.width,
    to.x,
    to.y,
    toH,
    toW,
    toX,
    toY,
  ])

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
    // Let the morph sheet finish fading over live glass before the route pops.
    setTimeout(() => {
      allowRemove.current = true
      const href = pendingHref.current
      pendingHref.current = null
      if (router.canGoBack()) router.back()
      else router.replace('/(app)/(tabs)/home')
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
    (href: string) => {
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
    openAfterDismiss(`/(app)/artist/${artistId}`)
  }, [libraryArtists, openAfterDismiss, track])

  const openAlbum = useCallback(() => {
    if (!track?.album) return
    const albumId =
      track.albumId ??
      libraryAlbums.find((album) => album.name === track.album)?.id
    if (!albumId) return
    openAfterDismiss(`/(app)/album/${albumId}`)
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

  const sheetStyle = useAnimatedStyle(() => {
    const p = progress.value
    const tw = Math.max(toW.value, 1)
    const th = Math.max(toH.value, 1)
    const scaleX = interpolate(p, [0, 1], [fromW.value / tw, 1], Extrapolation.CLAMP)
    const scaleY = interpolate(p, [0, 1], [fromH.value / th, 1], Extrapolation.CLAMP)
    const fromCx = fromX.value + fromW.value / 2
    const fromCy = fromY.value + fromH.value / 2
    const toCx = toX.value + toW.value / 2
    const toCy = toY.value + toH.value / 2
    return {
      position: 'absolute' as const,
      left: toX.value,
      top: toY.value,
      width: toW.value,
      height: toH.value,
      borderRadius: interpolate(p, [0, 1], [radii.lg, 0], Extrapolation.CLAMP),
      overflow: 'hidden' as const,
      opacity: sheetOpacity.value,
      borderWidth: interpolate(p, [0, 0.85, 1], [StyleSheet.hairlineWidth, StyleSheet.hairlineWidth, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateX: interpolate(p, [0, 1], [fromCx - toCx, 0], Extrapolation.CLAMP),
        },
        {
          translateY: interpolate(p, [0, 1], [fromCy - toCy, 0], Extrapolation.CLAMP),
        },
        { scaleX },
        { scaleY },
      ],
    }
  })

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [EXPANDED_CONTENT_FADE.start, EXPANDED_CONTENT_FADE.end],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }))

  /** Mini row counter-scales so it stays readable as the sheet shrinks into the dock. */
  const miniChromeStyle = useAnimatedStyle(() => {
    const p = progress.value
    const tw = Math.max(toW.value, 1)
    const th = Math.max(toH.value, 1)
    const sx = Math.max(
      interpolate(p, [0, 1], [fromW.value / tw, 1], Extrapolation.CLAMP),
      0.001,
    )
    const sy = Math.max(
      interpolate(p, [0, 1], [fromH.value / th, 1], Extrapolation.CLAMP),
      0.001,
    )
    const fw = fromW.value
    const fh = fromH.value
    return {
      opacity: interpolate(
        p,
        [MINI_CONTENT_FADE.start, MINI_CONTENT_FADE.end],
        [1, 0],
        Extrapolation.CLAMP,
      ),
      position: 'absolute' as const,
      left: (tw - fw) / 2,
      top: (th - fh) / 2,
      width: fw,
      height: fh,
      transform: [{ scaleX: 1 / sx }, { scaleY: 1 / sy }],
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

  return (
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
              <Animated.View
                pointerEvents="none"
                style={[styles.miniChrome, miniChromeStyle]}
              >
                {track.artworkUrl ? (
                  <Image
                    source={{ uri: track.artworkUrl }}
                    style={styles.miniArt}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={styles.miniArt} />
                )}
                <View style={styles.miniMeta}>
                  <Text style={styles.miniTitle} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text style={styles.miniArtist} numberOfLines={1}>
                    {track.artist}
                  </Text>
                </View>
                <View style={styles.miniPlay}>
                  <AccentGradient style={styles.miniPlayFill}>
                    <Icon
                      name={isPlaying ? 'pause.fill' : 'play.fill'}
                      tintColor={colors.onAccent}
                      size={18}
                    />
                  </AccentGradient>
                </View>
              </Animated.View>

              <Animated.View
                style={[
                  styles.expanded,
                  expandedStyle,
                  {
                    paddingTop: Math.max(insets.top, spacing.sm),
                    paddingBottom: Math.max(insets.bottom, spacing.lg),
                  },
                ]}
              >
                <View style={styles.handleRow}>
                  <View style={styles.handle} />
                </View>

                <View style={styles.artWrap}>
                  {track.artworkUrl ? (
                    <Image
                      source={{ uri: track.artworkUrl }}
                      style={styles.art}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      priority="high"
                    />
                  ) : (
                    <View style={[styles.art, styles.artFallback]} />
                  )}
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
                </View>

                <View style={styles.stage}>
                  <PlayerProgress durationMs={track.durationMs} />

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
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        </View>
      </AppErrorBoundary>
    </GestureHandlerRootView>
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
    backgroundColor: 'rgba(36, 20, 58, 0.96)',
    borderColor: colors.glassBorder,
  },
  miniChrome: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    zIndex: 2,
  },
  miniArt: {
    width: MINI_ART,
    height: MINI_ART,
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
  },
  miniMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  miniTitle: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18,
  },
  miniArtist: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  miniPlay: {
    width: MINI_PLAY,
    height: MINI_PLAY,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  miniPlayFill: {
    width: MINI_PLAY,
    height: MINI_PLAY,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expanded: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    width: '100%',
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  stage: {
    flex: 1,
    width: '100%',
    maxWidth: 420,
    justifyContent: 'flex-end',
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  artWrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 420,
    aspectRatio: 1,
    maxHeight: '48%',
    alignSelf: 'center',
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
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  metaLink: {
    maxWidth: '100%',
  },
  title: {
    ...typography.title,
    fontSize: 26,
    color: colors.text,
    textAlign: 'center',
  },
  artist: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 17,
    textAlign: 'center',
  },
  album: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  dock: {
    gap: spacing.md,
    paddingTop: spacing.sm,
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
