import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import {
  ALPHABET_INDEX_LETTERS,
  alphabetIndexFromRelativeScrub,
  alphabetIndexFromY,
  type AlphabetIndexLetter,
  type AlphabetIndexMap,
} from '@/src/domain/alphabetIndex'
import { Glass } from '@/src/theme/Glass'
import { useMotionEnabled } from '@/src/theme/motion'
import { colors, chrome, motion, radii, spacing, typography } from '@/src/theme/tokens'

type Props = {
  readonly indexMap: AlphabetIndexMap
  readonly onSelectLetter: (letter: AlphabetIndexLetter) => void
  readonly visible?: boolean
  readonly safeBottom?: number
  readonly topInset?: number
}

export const AlphabetIndex = ({
  indexMap,
  onSelectLetter,
  visible = false,
  safeBottom = 0,
  topInset = 0,
}: Props) => {
  const { t } = useTranslation()
  const motionOn = useMotionEnabled()
  const railRef = useRef<View>(null)
  const frame = useRef({ pageY: 0, height: 0 })
  const lastLetter = useRef<AlphabetIndexLetter | null>(null)
  const anchor = useRef<{ index: number; y: number } | null>(null)
  const [scrubLetter, setScrubLetter] = useState<AlphabetIndexLetter | null>(null)
  const opacity = useSharedValue(0)

  const active = useMemo(() => {
    const set = new Set<AlphabetIndexLetter>()
    for (const letter of ALPHABET_INDEX_LETTERS) {
      if (indexMap[letter] !== undefined) set.add(letter)
    }
    return set
  }, [indexMap])

  const shown = visible || scrubLetter !== null
  const bottom = chrome.miniBottomOffset + chrome.miniHeight + Math.max(safeBottom, spacing.sm)

  const measure = useCallback(() => {
    railRef.current?.measureInWindow((_x, pageY, _w, height) => {
      if (height > 0) frame.current = { pageY, height }
    })
  }, [])

  useEffect(() => {
    opacity.value = withTiming(shown ? 1 : 0, {
      duration: motionOn ? motion.duration.ui : 0,
    })
    if (shown) requestAnimationFrame(measure)
  }, [measure, motionOn, opacity, shown])

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  const yInRail = (event: GestureResponderEvent): number => {
    const { pageY, height } = frame.current
    if (height <= 0) return Math.max(0, event.nativeEvent.locationY)
    return Math.min(height, Math.max(0, event.nativeEvent.pageY - pageY))
  }

  const focus = useCallback(
    (letter: AlphabetIndexLetter, scrubbing: boolean) => {
      if (scrubbing) {
        setScrubLetter((prev) => (prev === letter ? prev : letter))
      }
      if (indexMap[letter] === undefined) return
      if (!scrubbing) {
        lastLetter.current = null
      } else if (lastLetter.current === letter) {
        return
      }
      lastLetter.current = letter
      onSelectLetter(letter)
    },
    [indexMap, onSelectLetter],
  )

  const endScrub = useCallback(() => {
    const letter = lastLetter.current
    anchor.current = null
    setScrubLetter(null)
    if (letter && indexMap[letter] !== undefined) {
      lastLetter.current = null
      onSelectLetter(letter)
    } else {
      lastLetter.current = null
    }
  }, [indexMap, onSelectLetter])

  const onGrant = useCallback(
    (event: GestureResponderEvent) => {
      const y = yInRail(event)
      const height = Math.max(frame.current.height, 1)
      const index = alphabetIndexFromY(y, height, ALPHABET_INDEX_LETTERS.length)
      anchor.current = { index, y }
      const letter = ALPHABET_INDEX_LETTERS[index]
      if (letter) focus(letter, true)
    },
    [focus],
  )

  const onMove = useCallback(
    (event: GestureResponderEvent) => {
      if (!anchor.current) return
      const y = yInRail(event)
      const height = Math.max(frame.current.height, 1)
      const index = alphabetIndexFromRelativeScrub(
        anchor.current.index,
        anchor.current.y,
        y,
        height,
        ALPHABET_INDEX_LETTERS.length,
      )
      const letter = ALPHABET_INDEX_LETTERS[index]
      if (letter) focus(letter, true)
    },
    [focus],
  )

  return (
    <Animated.View
      pointerEvents={shown ? 'box-none' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.wrap,
        fadeStyle,
        { top: Math.max(topInset, spacing.sm), bottom },
      ]}
    >
      {scrubLetter ? (
        <View pointerEvents="none" style={styles.hudWrap}>
          <Glass intensity={16} style={styles.hudGlass} contentStyle={styles.hudInner}>
            <Text style={styles.hudLetter}>{scrubLetter}</Text>
          </Glass>
        </View>
      ) : null}
      <View
        ref={railRef}
        style={styles.railHit}
        onLayout={measure}
        onStartShouldSetResponder={() => shown}
        onMoveShouldSetResponder={() => shown}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={endScrub}
        onResponderTerminate={endScrub}
      >
        <Glass
          intensity={16}
          style={styles.railGlass}
          contentStyle={styles.railInner}
          pointerEvents="none"
        >
          {ALPHABET_INDEX_LETTERS.map((letter) => {
            const enabled = active.has(letter)
            return (
              <View
                key={letter}
                accessible
                accessibilityRole="button"
                accessibilityLabel={
                  letter === '#'
                    ? t('library.alphabetJumpSymbols')
                    : t('library.alphabetJumpLetter', { letter })
                }
                accessibilityState={{
                  disabled: !enabled,
                  selected: scrubLetter === letter,
                }}
                accessibilityActions={enabled ? [{ name: 'activate' }] : undefined}
                onAccessibilityAction={() => {
                  if (!enabled) return
                  lastLetter.current = null
                  focus(letter, false)
                }}
                style={styles.letterHit}
              >
                <Text
                  style={[
                    styles.letter,
                    enabled ? styles.letterOn : styles.letterOff,
                    scrubLetter === letter ? styles.letterFocus : null,
                  ]}
                >
                  {letter}
                </Text>
              </View>
            )
          })}
        </Glass>
      </View>
    </Animated.View>
  )
}

export const ALPHABET_INDEX_LIST_INSET = spacing.lg + spacing.sm

const iosCurve =
  Platform.OS === 'ios' ? ({ borderCurve: 'continuous' } as const) : {}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: spacing.xs,
    zIndex: 20,
    alignItems: 'flex-end',
  },
  railHit: {
    flex: 1,
  },
  railGlass: {
    flex: 1,
    borderRadius: radii.pill,
    overflow: 'hidden',
    ...iosCurve,
  },
  railInner: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: '100%',
    minWidth: 18,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  letterHit: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  letter: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 12,
    textAlign: 'center',
  },
  letterOn: {
    color: colors.textSecondary,
  },
  letterOff: {
    color: 'rgba(232, 220, 255, 0.28)',
  },
  letterFocus: {
    color: colors.text,
    fontWeight: '700',
  },
  hudWrap: {
    position: 'absolute',
    right: spacing.xxl + spacing.md,
    alignSelf: 'center',
    top: '42%',
  },
  hudGlass: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...iosCurve,
  },
  hudInner: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudLetter: {
    ...typography.title,
    fontSize: 40,
    color: colors.text,
  },
})
