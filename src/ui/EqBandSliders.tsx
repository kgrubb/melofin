import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import {
  EQ_UI_BANDS,
  clampEqGain,
  fiveBandGainsFromTen,
  setFiveBandGain,
  type EqGains,
} from '@/src/domain/eqPresets'
import { colors, radii, spacing, typography } from '@/src/theme/tokens'

const HIT = 44
const TRACK_HEIGHT = 140
const TRACK_WIDTH = 6
const THUMB = 28
const MAX_DB = 24

const dbToY = (db: number): number => {
  const t = (clampEqGain(db) + MAX_DB) / (MAX_DB * 2)
  return (1 - t) * TRACK_HEIGHT
}

const yToDb = (y: number): number => {
  const clamped = Math.max(0, Math.min(TRACK_HEIGHT, y))
  const t = 1 - clamped / TRACK_HEIGHT
  return clampEqGain(t * MAX_DB * 2 - MAX_DB)
}

type Props = {
  readonly gainsDb: EqGains
  readonly onChange: (gainsDb: EqGains) => void
  readonly onCommit?: (gainsDb: EqGains) => void
}

export const EqBandSliders = ({ gainsDb, onChange, onCommit }: Props) => {
  const [draft, setDraft] = useState(gainsDb)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    setDraft(gainsDb)
  }, [gainsDb])

  const applyAtY = (bandIndex: number, y: number) => {
    const next = setFiveBandGain(draftRef.current, bandIndex, yToDb(y))
    draftRef.current = next
    setDraft(next)
    onChange(next)
  }

  const commit = () => {
    onCommit?.(draftRef.current)
  }

  const five = fiveBandGainsFromTen(draft)

  return (
    <View style={styles.wrap} accessibilityLabel="Equalizer bands">
      <View style={styles.zeroLine} pointerEvents="none" />
      <View style={styles.row}>
        {EQ_UI_BANDS.map((band, bandIndex) => {
          const db = five[bandIndex] ?? 0
          const thumbY = dbToY(db)
          const rounded = Math.round(db)
          const gesture = Gesture.Pan()
            .runOnJS(true)
            .hitSlop(8)
            .onBegin((e) => applyAtY(bandIndex, e.y))
            .onUpdate((e) => applyAtY(bandIndex, e.y))
            .onEnd(commit)
            .onFinalize(commit)

          const tap = Gesture.Tap()
            .runOnJS(true)
            .onEnd((e) => {
              applyAtY(bandIndex, e.y)
              commit()
            })

          return (
            <View key={band.label} style={styles.band}>
              <Text
                style={[styles.value, rounded !== 0 ? styles.valueActive : null]}
                accessibilityElementsHidden
              >
                {rounded > 0 ? `+${rounded}` : `${rounded}`}
              </Text>
              <GestureDetector gesture={Gesture.Exclusive(gesture, tap)}>
                <View
                  style={styles.hit}
                  accessibilityRole="adjustable"
                  accessibilityLabel={`${band.label} band`}
                  accessibilityHint="Swipe up or down to adjust"
                  accessibilityValue={{
                    min: -MAX_DB,
                    max: MAX_DB,
                    now: rounded,
                    text: `${rounded} decibels`,
                  }}
                  accessibilityActions={[
                    { name: 'increment' },
                    { name: 'decrement' },
                  ]}
                  onAccessibilityAction={(event) => {
                    const delta =
                      event.nativeEvent.actionName === 'increment'
                        ? 1
                        : event.nativeEvent.actionName === 'decrement'
                          ? -1
                          : 0
                    if (!delta) return
                    const next = setFiveBandGain(
                      draftRef.current,
                      bandIndex,
                      (fiveBandGainsFromTen(draftRef.current)[bandIndex] ?? 0) +
                        delta,
                    )
                    draftRef.current = next
                    setDraft(next)
                    onChange(next)
                    onCommit?.(next)
                  }}
                >
                  <View style={styles.track} pointerEvents="none">
                    {db >= 0 ? (
                      <View
                        style={[
                          styles.fill,
                          {
                            top: thumbY,
                            height: Math.max(0, TRACK_HEIGHT / 2 - thumbY),
                          },
                        ]}
                      />
                    ) : (
                      <View
                        style={[
                          styles.fill,
                          {
                            top: TRACK_HEIGHT / 2,
                            height: Math.max(0, thumbY - TRACK_HEIGHT / 2),
                          },
                        ]}
                      />
                    )}
                  </View>
                  <View
                    style={[
                      styles.thumb,
                      { top: Math.min(TRACK_HEIGHT - THUMB, Math.max(0, thumbY - THUMB / 2)) },
                    ]}
                    pointerEvents="none"
                  />
                </View>
              </GestureDetector>
              <Text style={styles.label}>{band.label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    position: 'relative',
  },
  zeroLine: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    // value row (~18) + gap + half track
    top: spacing.md + 18 + spacing.xs + TRACK_HEIGHT / 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.glassBorder,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  band: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: HIT,
  },
  value: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    minHeight: 18,
    textAlign: 'center',
  },
  valueActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  hit: {
    width: HIT,
    height: TRACK_HEIGHT,
  },
  track: {
    position: 'absolute',
    top: 0,
    left: (HIT - TRACK_WIDTH) / 2,
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.accent,
    opacity: 0.55,
  },
  thumb: {
    position: 'absolute',
    left: (HIT - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: radii.pill,
    backgroundColor: colors.onAccent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
})
