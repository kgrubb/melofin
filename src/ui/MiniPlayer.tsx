import { Image } from 'expo-image'
import { useCallback, useRef } from 'react'
import { StyleSheet, Text, View, type View as RNView } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayerStore } from '@/src/store/player'
import { useCastStore } from '@/src/cast/castStore'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { Glass, nativeLiquidGlass } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { ProgressLine } from '@/src/ui/ProgressBar'
import { resizeArtworkUrl } from '@/src/services/jellyfin/library'
import { chrome, colors, motion, radii, spacing } from '@/src/theme/tokens'

const ART = 44
const PLAY = 44

/** Isolated so Glass chrome doesn't re-render on every position tick. */
const MiniProgress = ({
  durationMs,
  isPlaying,
}: {
  readonly durationMs: number
  readonly isPlaying: boolean
}) => {
  const positionMs = usePlayerStore((s) => s.positionMs)
  return (
    <ProgressLine
      positionMs={positionMs}
      durationMs={durationMs}
      isPlaying={isPlaying}
    />
  )
}

export const MiniPlayer = () => {
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const ref = useRef<RNView>(null)
  const track = usePlayerStore((s) => s.tracks[s.currentIndex])
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const togglePlaying = usePlayerStore((s) => s.togglePlaying)
  const nowPlayingOpen = usePlayerStore((s) => s.nowPlayingOpen)
  const setNowPlayingOpen = usePlayerStore((s) => s.setNowPlayingOpen)
  const setMiniPlayerFrame = usePlayerStore((s) => s.setMiniPlayerFrame)
  const castActive = useCastStore((s) => s.transfer.active.kind !== 'local')
  const onSheet =
    pathname.includes('/settings') || pathname.includes('/queue')
  const covered = nowPlayingOpen || onSheet

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) setMiniPlayerFrame({ x, y, width, height })
    })
  }, [setMiniPlayerFrame])

  const measureAsync = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const node = ref.current
        if (!node) {
          resolve()
          return
        }
        node.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) setMiniPlayerFrame({ x, y, width, height })
          resolve()
        })
      }),
    [setMiniPlayerFrame],
  )

  if (!track) return null

  const liquid = nativeLiquidGlass()
  const thumbArt = resizeArtworkUrl(track.artworkUrl, 'thumb')
  const bottom = Math.max(insets.bottom, spacing.sm) + chrome.miniBottomOffset

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={() => {
        if (covered) return
        measure()
      }}
      pointerEvents={covered ? 'none' : 'box-none'}
      style={[styles.wrap, { bottom, height: chrome.miniHeight }]}
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
    >
      <Glass
        style={[styles.glass, liquid ? null : styles.glassClip]}
        contentStyle={styles.row}
        intensity={42}
        isInteractive={liquid}
      >
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Now playing ${track.title}`}
          scaleTo={motion.scale.card}
          onPress={() => {
            void (async () => {
              await measureAsync()
              setNowPlayingOpen(true)
              router.navigate('/(app)/player')
            })()
          }}
          style={styles.mainHit}
        >
          {thumbArt ? (
            <Image
              source={{
                uri: thumbArt,
                cacheKey: `art-thumb-${track.id}`,
              }}
              style={styles.art}
              cachePolicy="memory-disk"
              recyclingKey={`art-thumb-${track.id}`}
            />
          ) : (
            <View style={styles.art} />
          )}
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <View style={styles.artistRow}>
              <Text style={styles.artist} numberOfLines={1}>
                {track.artist}
              </Text>
              {castActive ? (
                <Icon name="speaker.wave.2.fill" size={12} tintColor={colors.accent} />
              ) : null}
            </View>
          </View>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={togglePlaying}
          style={styles.playHit}
          hitSlop={12}
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
          <MiniProgress durationMs={track.durationMs} isPlaying={isPlaying} />
        </View>
      </Glass>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: chrome.tabBarMargin,
    right: chrome.tabBarMargin,
    zIndex: 20,
  },
  glass: {
    borderRadius: chrome.miniHeight / 2,
    flex: 1,
  },
  glassClip: {
    overflow: 'hidden',
  },
  row: {
    flex: 1,
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
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
