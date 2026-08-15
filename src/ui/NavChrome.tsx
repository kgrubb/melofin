import { StyleSheet, View } from 'react-native'
import { Glass } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { colors, motion, radii } from '@/src/theme/tokens'

type PressProps = {
  readonly onPress: () => void
}

/** Avoid SF Symbol stretch/weight quirks. */
const BackChevron = ({
  size = 18,
  color = colors.text,
}: {
  readonly size?: number
  readonly color?: string
}) => {
  const thickness = Math.max(2, Math.round(size * 0.14))
  const arm = size * 0.42
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: arm,
          height: arm,
          borderColor: color,
          borderLeftWidth: thickness,
          borderBottomWidth: thickness,
          transform: [{ rotate: '45deg' }, { translateX: size * 0.04 }],
        }}
      />
    </View>
  )
}

export const BackButton = ({
  onPress,
  label = 'Back',
}: PressProps & { readonly label?: string }) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    scaleTo={motion.scale.button}
    onPress={onPress}
    hitSlop={8}
    style={styles.press}
  >
    <Glass style={styles.glass} contentStyle={styles.circleInner} intensity={16}>
      <BackChevron />
    </Glass>
  </PressableScale>
)

/** Sheet grabber (tappable; swipe-down is primary). */
export const CloseChip = ({ onPress }: PressProps) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel="Close"
    scaleTo={motion.scale.button}
    onPress={onPress}
    hitSlop={12}
    style={styles.grabberPress}
  >
    <View style={styles.grabber} />
  </PressableScale>
)

export const MoreButton = ({
  onPress,
  label = 'More',
}: PressProps & { readonly label?: string }) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    scaleTo={motion.scale.button}
    onPress={onPress}
    hitSlop={8}
    style={styles.press}
  >
    <Glass style={styles.glass} contentStyle={styles.circleInner} intensity={16}>
      <View style={styles.ellipsis}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </Glass>
  </PressableScale>
)

const styles = StyleSheet.create({
  press: {
    alignSelf: 'flex-start',
  },
  glass: {
    borderRadius: radii.pill,
  },
  circleInner: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabberPress: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  ellipsis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
})
