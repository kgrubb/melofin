/* Reanimated shared values are intentionally mutated. */
/* eslint-disable react-hooks/immutability */
import { Image } from 'expo-image'
import { useCallback, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayerStore } from '@/src/store/player'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { Glass } from '@/src/theme/Glass'
import { IconButton, PressableScale } from '@/src/theme/motion'
import { sheetBackdropOpacity } from '@/src/theme/motionMath'
import { AppErrorBoundary } from '@/src/ui/AppErrorBoundary'
import { Icon } from '@/src/ui/Icon'
import { ScrubBar } from '@/src/ui/ProgressBar'
import { colors, motion, radii, spacing, typography } from '@/src/theme/tokens'

const DISMISS_DISTANCE = motion.sheet.dismissDistance
const DISMISS_VELOCITY = motion.sheet.dismissVelocity

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
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()

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
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setNowPlayingOpen = usePlayerStore((s) => s.setNowPlayingOpen)

  const progress = useSharedValue(reduceMotion ? 1 : 0)
  const dragY = useSharedValue(0)
  const closing = useSharedValue(false)

  useEffect(() => {
    setNowPlayingOpen(true)
    return () => setNowPlayingOpen(false)
  }, [setNowPlayingOpen])

  useEffect(() => {
    progress.value = reduceMotion ? 1 : withSpring(1, motion.spring.sheet)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate open once per mount/reduceMotion
  }, [reduceMotion])

  const finishDismiss = useCallback(() => {
    router.back()
  }, [router])

  const dismiss = useCallback(() => {
    if (closing.value) return
    closing.value = true
    if (reduceMotion) {
      finishDismiss()
      return
    }
    progress.value = withTiming(
      0,
      { duration: motion.duration.ui, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finishDismiss)()
      },
    )
    dragY.value = withTiming(0, { duration: motion.duration.ui })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reanimated shared values
  }, [finishDismiss, reduceMotion])

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      if (closing.value) return
      dragY.value = Math.max(0, event.translationY)
    })
    .onEnd((event) => {
      if (closing.value) return
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(dismiss)()
        return
      }
      dragY.value = withSpring(0, motion.spring.sheet)
    })

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: sheetBackdropOpacity(progress.value, dragY.value, height),
  }))

  const sheetStyle = useAnimatedStyle(() => {
    const travel = height * (1 - progress.value)
    return {
      transform: [{ translateY: travel + dragY.value }],
    }
  })

  if (!track) {
    return (
      <View style={styles.root}>
        <Pressable style={styles.backdropHit} onPress={() => router.back()} />
        <View style={[styles.emptySheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.empty}>Nothing playing</Text>
        </View>
      </View>
    )
  }

  return (
    <AppErrorBoundary fallbackTitle="Player error">
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <Pressable
          accessibilityLabel="Dismiss player"
          style={styles.backdropHit}
          onPress={dismiss}
        />

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              sheetStyle,
              {
                paddingTop: Math.max(insets.top, spacing.md),
                paddingBottom: Math.max(insets.bottom, spacing.md),
              },
            ]}
          >
            <Glass style={styles.sheetGlass} contentStyle={styles.sheetInner} intensity={36}>
              <View style={styles.handleRow}>
                <View style={styles.handle} />
              </View>

              <View style={styles.stage}>
                <View style={styles.artWrap}>
                  {track.artworkUrl ? (
                    <Image
                      source={{ uri: track.artworkUrl }}
                      style={styles.art}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.art, styles.artFallback]} />
                  )}
                </View>

                <View style={styles.meta}>
                  <Text style={styles.title} numberOfLines={2}>
                    {track.title}
                  </Text>
                  <Text style={styles.artist} numberOfLines={1}>
                    {track.artist}
                  </Text>
                  {track.album ? (
                    <Text style={styles.album} numberOfLines={1}>
                      {track.album}
                    </Text>
                  ) : null}
                </View>

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
                        tintColor={repeat === 'off' ? colors.textSecondary : colors.accent}
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
                      size={52}
                    >
                      <Icon name="backward.fill" tintColor={colors.text} size={30} />
                    </IconButton>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                      haptic="medium"
                      onPress={() => setPlaying(!isPlaying)}
                      style={styles.playPress}
                    >
                      <AccentGradient style={styles.playButton}>
                        <Icon
                          name={isPlaying ? 'pause.fill' : 'play.fill'}
                          tintColor={colors.onAccent}
                          size={28}
                        />
                      </AccentGradient>
                    </PressableScale>
                    <IconButton accessibilityLabel="Next" onPress={goNext} size={52}>
                      <Icon name="forward.fill" tintColor={colors.text} size={30} />
                    </IconButton>
                  </View>
                </View>
              </View>
            </Glass>
          </Animated.View>
        </GestureDetector>
      </View>
    </AppErrorBoundary>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#05020A',
    pointerEvents: 'none',
  },
  backdropHit: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  sheet: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  sheetGlass: {
    flex: 1,
    borderRadius: radii.xl,
  },
  sheetInner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
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
    alignSelf: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  artWrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    width: '100%',
    aspectRatio: 1,
    maxHeight: '48%',
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
  },
  title: {
    ...typography.title,
    fontSize: 26,
    color: colors.text,
  },
  artist: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 17,
  },
  album: {
    color: colors.textSecondary,
    fontSize: 14,
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
