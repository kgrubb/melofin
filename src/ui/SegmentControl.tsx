import { useEffect, useState } from 'react'
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Glass } from '@/src/theme/Glass'
import { useMotionEnabled } from '@/src/theme/motion'
import { colors, motion, radii, spacing } from '@/src/theme/tokens'

type SegmentLayout = {
  readonly x: number
  readonly width: number
}

type Props<T extends string> = {
  readonly values: readonly T[]
  readonly value: T
  readonly onChange: (next: T) => void
}

export const SegmentControl = <T extends string>({
  values,
  value,
  onChange,
}: Props<T>) => {
  const enabled = useMotionEnabled()
  const [layouts, setLayouts] = useState<Readonly<Record<string, SegmentLayout>>>({})
  const pillX = useSharedValue(0)
  const pillW = useSharedValue(0)

  useEffect(() => {
    const layout = layouts[value]
    if (!layout) return
    if (enabled) {
      pillX.value = withSpring(layout.x, motion.spring.selection)
      pillW.value = withSpring(layout.width, motion.spring.selection)
      return
    }
    pillX.value = withTiming(layout.x, { duration: 0 })
    pillW.value = withTiming(layout.width, { duration: 0 })
  }, [enabled, layouts, pillW, pillX, value])

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: Math.max(pillW.value, 1),
  }))

  return (
    <Glass style={styles.shell} contentStyle={styles.row} intensity={16}>
      <Animated.View style={[styles.pill, pillStyle]} />
      {values.map((item) => {
        const selected = item === value
        return (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={styles.chipPress}
            onLayout={(event: LayoutChangeEvent) => {
              const { x, width } = event.nativeEvent.layout
              setLayouts((prev) => {
                const existing = prev[item]
                if (existing && existing.x === x && existing.width === width) return prev
                return { ...prev, [item]: { x, width } }
              })
            }}
          >
            <View style={styles.chip}>
              <Text style={selected ? styles.chipLabelActive : styles.chipLabel}>{item}</Text>
            </View>
          </Pressable>
        )
      })}
    </Glass>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.pill,
    marginBottom: spacing.md,
  },
  row: {
    position: 'relative',
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    pointerEvents: 'none',
  },
  chipPress: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    zIndex: 1,
  },
  chip: {
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    color: colors.textSecondary,
    textTransform: 'capitalize',
    fontWeight: '600',
    fontSize: 13,
  },
  chipLabelActive: {
    color: '#1A0B2E',
    textTransform: 'capitalize',
    fontWeight: '700',
    fontSize: 13,
  },
})
