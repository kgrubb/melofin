import { useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { scrubPositionFromX, scrubRatio, isPlaybackJump } from '@/src/theme/motionMath'
import { useMotionEnabled } from '@/src/theme/motion'
import { colors, motion, radii, spacing } from '@/src/theme/tokens'

const formatMs = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** 0-1 shared value that climbs linearly for the remaining track time. */
const usePlaybackProgress = (
  positionMs: number,
  durationMs: number,
  isPlaying: boolean,
) => {
  const progress = useSharedValue(scrubRatio(positionMs, durationMs))
  const lastAnchor = useRef({ ms: positionMs, at: Date.now() })
  const wasPlaying = useRef(false)

  useEffect(() => {
    const ratio = scrubRatio(positionMs, durationMs)
    // Engine syncs UI position ~500ms. Ignore those ticks so the linear fill
    // keeps running. Re-anchor on seeks/track jumps or play/pause edges.
    const jumped = isPlaybackJump(
      positionMs,
      lastAnchor.current.ms,
      lastAnchor.current.at,
      Date.now(),
      wasPlaying.current && isPlaying,
    )
    const started = isPlaying && !wasPlaying.current
    const stopped = !isPlaying && wasPlaying.current
    wasPlaying.current = isPlaying

    if (!isPlaying || durationMs <= 0) {
      cancelAnimation(progress)
      progress.value = ratio
      lastAnchor.current = { ms: positionMs, at: Date.now() }
      return
    }

    if (!started && !stopped && !jumped) return

    lastAnchor.current = { ms: positionMs, at: Date.now() }
    cancelAnimation(progress)
    progress.value = ratio
    const remaining = Math.max(0, durationMs - positionMs)
    if (remaining <= 0) {
      progress.value = 1
      return
    }

    progress.value = withTiming(1, {
      duration: remaining,
      easing: Easing.linear,
    })
  }, [durationMs, isPlaying, positionMs, progress])

  return progress
}

const useSmoothClock = (
  positionMs: number,
  durationMs: number,
  isPlaying: boolean,
): number => {
  const [smoothMs, setSmoothMs] = useState(positionMs)
  const anchor = useRef({ positionMs, at: Date.now() })

  useEffect(() => {
    const jumped = isPlaybackJump(
      positionMs,
      anchor.current.positionMs,
      anchor.current.at,
      Date.now(),
      isPlaying,
    )
    if (!jumped && isPlaying) return
    anchor.current = { positionMs, at: Date.now() }
    setSmoothMs(positionMs)
  }, [isPlaying, positionMs])

  useEffect(() => {
    if (!isPlaying) {
      setSmoothMs(positionMs)
      return
    }

    const tick = () => {
      const next = Math.min(
        durationMs,
        anchor.current.positionMs + (Date.now() - anchor.current.at),
      )
      setSmoothMs(next)
    }
    tick()
    // 1Hz is enough for time labels. Do not recreate on engine position ticks.
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [durationMs, isPlaying])

  return isPlaying ? smoothMs : positionMs
}

export const ProgressLine = ({
  positionMs,
  durationMs,
  isPlaying,
}: {
  readonly positionMs: number
  readonly durationMs: number
  readonly isPlaying: boolean
}) => {
  const progress = usePlaybackProgress(positionMs, durationMs, isPlaying)
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(progress.value, 0.001) }],
  }))

  return (
    <View
      style={styles.lineTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: Math.max(durationMs, 1),
        now: Math.min(positionMs, durationMs),
      }}
    >
      <Animated.View style={[styles.lineFill, fillStyle]} />
    </View>
  )
}

export const ScrubBar = ({
  positionMs,
  durationMs,
  isPlaying,
  onSeek,
}: {
  readonly positionMs: number
  readonly durationMs: number
  readonly isPlaying: boolean
  readonly onSeek: (positionMs: number) => void
}) => {
  const { t } = useTranslation()
  const enabled = useMotionEnabled()
  const [scrubbing, setScrubbing] = useState(false)
  const [labelMs, setLabelMs] = useState(positionMs)
  const trackWidth = useSharedValue(0)
  const scrubRatioSV = useSharedValue(-1)
  const draftMsSV = useSharedValue(positionMs)
  const durationSV = useSharedValue(durationMs)
  const labelSecSV = useSharedValue(Math.floor(positionMs / 1000))
  const expand = useSharedValue(0)
  const progress = usePlaybackProgress(positionMs, durationMs, isPlaying && !scrubbing)
  const clockMs = useSmoothClock(positionMs, durationMs, isPlaying && !scrubbing)
  const shownMs = scrubbing ? labelMs : clockMs

  useEffect(() => {
    durationSV.value = durationMs
  }, [durationMs, durationSV])

  useEffect(() => {
    if (scrubbing) return
    setLabelMs(clockMs)
    labelSecSV.value = Math.floor(clockMs / 1000)
  }, [clockMs, labelSecSV, scrubbing])

  useEffect(() => {
    if (!enabled) {
      expand.value = scrubbing ? 1 : 0
      return
    }
    expand.value = withSpring(scrubbing ? 1 : 0, motion.spring.press)
  }, [enabled, expand, scrubbing])

  const beginScrub = (ms: number) => {
    setLabelMs(ms)
    setScrubbing(true)
  }

  const updateLabel = (ms: number) => {
    setLabelMs(ms)
  }

  const finishScrub = (ms: number) => {
    onSeek(ms)
    setLabelMs(ms)
    setScrubbing(false)
  }

  const cancelScrub = () => {
    setScrubbing(false)
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-16, 16])
    .onBegin((event) => {
      const width = trackWidth.value
      const duration = durationSV.value
      if (duration <= 0 || width <= 0) return
      const ms = scrubPositionFromX(event.x, width, duration)
      const ratio = scrubRatio(ms, duration)
      scrubRatioSV.value = ratio
      draftMsSV.value = ms
      labelSecSV.value = Math.floor(ms / 1000)
      runOnJS(beginScrub)(ms)
    })
    .onUpdate((event) => {
      const width = trackWidth.value
      const duration = durationSV.value
      if (duration <= 0 || width <= 0) return
      const ms = scrubPositionFromX(event.x, width, duration)
      const ratio = scrubRatio(ms, duration)
      scrubRatioSV.value = ratio
      draftMsSV.value = ms
      const sec = Math.floor(ms / 1000)
      if (sec !== labelSecSV.value) {
        labelSecSV.value = sec
        runOnJS(updateLabel)(ms)
      }
    })
    .onEnd(() => {
      const ms = draftMsSV.value
      const duration = durationSV.value
      if (duration <= 0 || scrubRatioSV.value < 0) {
        scrubRatioSV.value = -1
        runOnJS(cancelScrub)()
        return
      }
      // Pin the running fill to the seek target BEFORE clearing the scrub
      // overlay. Otherwise we flash to the pre-scrub animated ratio.
      progress.value = scrubRatio(ms, duration)
      scrubRatioSV.value = -1
      runOnJS(finishScrub)(ms)
    })
    .onFinalize((_event, success) => {
      if (success) return
      scrubRatioSV.value = -1
      runOnJS(cancelScrub)()
    })

  const tap = Gesture.Tap().onEnd((event) => {
    const width = trackWidth.value
    const duration = durationSV.value
    const ms = scrubPositionFromX(event.x, width, duration)
    if (duration <= 0 || width <= 0) return
    progress.value = scrubRatio(ms, duration)
    scrubRatioSV.value = -1
    runOnJS(finishScrub)(ms)
  })

  const gesture = Gesture.Exclusive(pan, tap)

  const fillStyle = useAnimatedStyle(() => {
    const ratio = scrubRatioSV.value >= 0 ? scrubRatioSV.value : progress.value
    return { transform: [{ scaleX: Math.max(ratio, 0.001) }] }
  })
  const thumbStyle = useAnimatedStyle(() => {
    const ratio = scrubRatioSV.value >= 0 ? scrubRatioSV.value : progress.value
    const width = trackWidth.value
    return {
      transform: [
        { translateX: ratio * width },
        { scale: 0.85 + expand.value * 0.15 },
      ],
    }
  })
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: 1 + expand.value * 0.5 }],
  }))

  return (
    <View style={styles.scrubWrap}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('player.seek')}
          accessibilityHint={t('player.seekHint')}
          accessibilityValue={{
            min: 0,
            max: Math.max(durationMs, 1),
            now: Math.min(shownMs, durationMs),
            text: formatMs(shownMs),
          }}
          accessibilityActions={[
            { name: 'increment', label: t('player.skipForward') },
            { name: 'decrement', label: t('player.skipBack') },
          ]}
          onAccessibilityAction={(event) => {
            if (durationMs <= 0) return
            const step = Math.max(5_000, Math.round(durationMs * 0.05))
            if (event.nativeEvent.actionName === 'increment') {
              onSeek(Math.min(durationMs, positionMs + step))
              return
            }
            if (event.nativeEvent.actionName === 'decrement') {
              onSeek(Math.max(0, positionMs - step))
            }
          }}
          onLayout={(event: LayoutChangeEvent) => {
            trackWidth.value = event.nativeEvent.layout.width
          }}
          style={styles.scrubHit}
        >
          <Animated.View style={[styles.scrubTrack, trackStyle]}>
            <Animated.View style={[styles.scrubFill, fillStyle]} />
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={styles.time}>{formatMs(shownMs)}</Text>
        <Text style={styles.time}>{formatMs(durationMs)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  lineTrack: {
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  lineFill: {
    height: '100%',
    width: '100%',
    backgroundColor: colors.accent,
    transformOrigin: 'left center',
  },
  scrubWrap: {
    gap: spacing.sm,
  },
  scrubHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  scrubTrack: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.hairline,
    overflow: 'visible',
    justifyContent: 'center',
  },
  scrubFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    transformOrigin: 'left center',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
})
