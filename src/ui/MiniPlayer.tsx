import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayerStore } from '@/src/store/player'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { Glass } from '@/src/theme/Glass'
import {
  miniEntering,
  miniExiting,
  PressableScale,
  useMotionEnabled,
} from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { ProgressLine } from '@/src/ui/ProgressBar'
import { chrome, colors, motion, radii, spacing } from '@/src/theme/tokens'

const ART = 44
const PLAY = 40

export const MiniPlayer = () => {
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const enabled = useMotionEnabled()
  const track = usePlayerStore((s) => s.tracks[s.currentIndex])
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const nowPlayingOpen = usePlayerStore((s) => s.nowPlayingOpen)
  const positionMs = usePlayerStore((s) => s.positionMs)
  const onSheet =
    pathname.includes('/settings') || pathname.includes('/queue')

  if (!track || onSheet || nowPlayingOpen) return null

  const bottom =
    Math.max(insets.bottom, spacing.sm) + chrome.miniBottomOffset

  return (
    <Animated.View
      entering={miniEntering(enabled)}
      exiting={miniExiting(enabled)}
      style={[styles.wrap, { bottom }]}
      pointerEvents="box-none"
    >
      <Glass style={styles.glass} contentStyle={styles.row} intensity={32}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Now playing ${track.title}`}
          scaleTo={motion.scale.card}
          onPress={() => router.navigate('/(app)/player')}
          style={styles.mainHit}
        >
          {track.artworkUrl ? (
            <Image source={{ uri: track.artworkUrl }} style={styles.art} />
          ) : (
            <View style={styles.art} />
          )}
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          haptic="medium"
          onPress={() => setPlaying(!isPlaying)}
          style={styles.playHit}
          hitSlop={8}
        >
          <AccentGradient style={styles.playButton}>
            <Icon
              name={isPlaying ? 'pause.fill' : 'play.fill'}
              tintColor={colors.onAccent}
              size={18}
            />
          </AccentGradient>
        </PressableScale>
        <View style={styles.progress} pointerEvents="none">
          <ProgressLine
            positionMs={positionMs}
            durationMs={track.durationMs}
            isPlaying={isPlaying}
          />
        </View>
      </Glass>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 20,
  },
  glass: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    minHeight: ART + spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mainHit: {
    flex: 1,
    minWidth: 0,
    minHeight: ART,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  art: {
    width: ART,
    height: ART,
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  title: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18,
  },
  artist: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  playHit: {
    width: PLAY,
    height: PLAY,
    borderRadius: radii.pill,
    overflow: 'hidden',
    zIndex: 2,
  },
  playButton: {
    width: PLAY,
    height: PLAY,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
})
