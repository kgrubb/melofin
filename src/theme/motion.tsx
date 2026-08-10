import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import type { ReactNode } from 'react'
import { colors, motion, radii } from '@/src/theme/tokens'

export const useMotionEnabled = (): boolean => !useReducedMotion()

type ScaleProps = Omit<PressableProps, 'style'> & {
  readonly children: ReactNode
  readonly scaleTo?: number
  readonly style?: StyleProp<ViewStyle>
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export const PressableScale = ({
  children,
  scaleTo = motion.scale.button,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: ScaleProps) => {
  const enabled = useMotionEnabled()
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(event) => {
        if (enabled && !disabled) {
          scale.value = withSpring(scaleTo, motion.spring.press)
        }
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        if (enabled) scale.value = withSpring(1, motion.spring.press)
        onPressOut?.(event)
      }}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  )
}

type HighlightProps = Omit<PressableProps, 'style'> & {
  readonly children: ReactNode
  readonly style?: StyleProp<ViewStyle>
  readonly contentStyle?: StyleProp<ViewStyle>
}

export const PressableHighlight = ({
  children,
  style,
  contentStyle,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: HighlightProps) => {
  const enabled = useMotionEnabled()
  const highlight = useSharedValue(0)
  const washStyle = useAnimatedStyle(() => ({
    opacity: highlight.value * 0.1,
  }))

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(event) => {
        if (enabled && !disabled) {
          highlight.value = withSpring(1, motion.spring.press)
        }
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        if (enabled) highlight.value = withSpring(0, motion.spring.press)
        onPressOut?.(event)
      }}
      style={style}
      {...rest}
    >
      <View style={[styles.highlightFrame, contentStyle]}>
        <Animated.View style={[styles.highlightWash, washStyle]} />
        {children}
      </View>
    </Pressable>
  )
}

type IconButtonProps = Omit<PressableProps, 'style'> & {
  readonly children: ReactNode
  readonly size?: number
  readonly style?: StyleProp<ViewStyle>
}

export const IconButton = ({
  children,
  size = 44,
  style,
  ...rest
}: IconButtonProps) => (
  <PressableScale
    style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2 }, style]}
    {...rest}
  >
    {children}
  </PressableScale>
)

export const settleEntering = (enabled: boolean) =>
  enabled ? FadeIn.duration(motion.duration.settle) : undefined

export const miniEntering = (enabled: boolean) =>
  enabled ? FadeIn.duration(motion.duration.ui) : undefined

export const miniExiting = (enabled: boolean) =>
  enabled ? FadeOut.duration(motion.duration.fast) : undefined

export const authCardEntering = (enabled: boolean) =>
  enabled
    ? FadeInDown.duration(motion.duration.ui).springify().damping(motion.spring.selection.damping)
    : undefined

const styles = StyleSheet.create({
  highlightFrame: {
    overflow: 'hidden',
    borderRadius: radii.sm,
  },
  highlightWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.text,
    pointerEvents: 'none',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
