import { LinearGradient } from 'expo-linear-gradient'
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import { BlurView } from 'expo-blur'
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassColorScheme,
  type GlassStyle,
  type GlassEffectStyleConfig,
} from 'expo-glass-effect'
import { useEffect, useState, type ReactNode } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { PressableScale, useMotionEnabled } from '@/src/theme/motion'
import { colors, gradients, motion, radii } from '@/src/theme/tokens'

type GlassProps = ViewProps & {
  readonly children?: ReactNode
  readonly intensity?: number
  readonly contentStyle?: StyleProp<ViewStyle>
  readonly glassEffectStyle?: GlassStyle | GlassEffectStyleConfig
  readonly tintColor?: string
  readonly isInteractive?: boolean
  readonly colorScheme?: GlassColorScheme
}

const webGlassStyle = {
  backdropFilter: 'blur(12px) saturate(140%)',
  WebkitBackdropFilter: 'blur(12px) saturate(140%)',
  backgroundColor: 'rgba(28, 14, 48, 0.28)',
} as ViewStyle

const continuousCurve =
  Platform.OS === 'ios' ? ({ borderCurve: 'continuous' as const } satisfies ViewStyle) : null

export const nativeLiquidGlass = (): boolean =>
  Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()

const useReduceTransparency = (): boolean => {
  const [reduceTransparency, setReduceTransparency] = useState(false)

  useEffect(() => {
    if (Platform.OS === 'web') return
    const probe = AccessibilityInfo.isReduceTransparencyEnabled
    if (typeof probe !== 'function') return

    void probe.call(AccessibilityInfo).then(setReduceTransparency)
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceTransparencyChanged',
      setReduceTransparency,
    )
    return () => sub?.remove()
  }, [])

  return reduceTransparency
}

/**
 * Tab bar / mini player / sheet chrome.
 * Use `Surface` for content cards/rows. iOS 26+: UIGlassEffect; older: dense BlurView.
 */
export const Glass = ({
  children,
  style,
  contentStyle,
  intensity = Platform.OS === 'web' ? 36 : 18,
  glassEffectStyle = 'regular',
  tintColor,
  isInteractive = false,
  colorScheme = 'dark',
  ...rest
}: GlassProps) => {
  const reduceTransparency = useReduceTransparency()
  const frame = <View style={[styles.inner, contentStyle]}>{children}</View>

  if (reduceTransparency) {
    return (
      <View style={[styles.shell, styles.opaqueFallback, continuousCurve, style]} {...rest}>
        {frame}
      </View>
    )
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.shell, styles.blurFill, webGlassStyle, continuousCurve, style]} {...rest}>
        <LinearGradient
          colors={[...gradients.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.passThrough]}
        />
        {frame}
      </View>
    )
  }

  if (nativeLiquidGlass()) {
    return (
      <GlassView
        style={[styles.shellLiquid, continuousCurve, style]}
        glassEffectStyle={glassEffectStyle}
        tintColor={tintColor}
        isInteractive={isInteractive}
        colorScheme={colorScheme}
        {...rest}
      >
        <View style={[styles.inner, contentStyle]} pointerEvents="box-none">
          {children}
        </View>
      </GlassView>
    )
  }

  return (
    <View
      style={[styles.shell, styles.blurFill, continuousCurve, style]}
      {...rest}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={intensity}
        tint="systemChromeMaterialDark"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.passThrough]}
      />
      {frame}
    </View>
  )
}

/** Group adjacent glass controls so Liquid Glass morphs as one material. */
export const GlassCluster = ({
  children,
  style,
  spacing: mergeSpacing = 10,
  ...rest
}: ViewProps & {
  readonly children?: ReactNode
  readonly spacing?: number
}) => {
  const reduceTransparency = useReduceTransparency()

  if (reduceTransparency || !nativeLiquidGlass()) {
    return (
      <View style={[{ gap: mergeSpacing }, style]} {...rest}>
        {children}
      </View>
    )
  }

  return (
    <GlassContainer spacing={mergeSpacing} style={style} {...rest}>
      {children}
    </GlassContainer>
  )
}

/** Opaque surface for cards, list rows, forms. */
export const Surface = ({
  children,
  style,
  contentStyle,
  ...rest
}: ViewProps & {
  readonly children?: ReactNode
  readonly contentStyle?: StyleProp<ViewStyle>
}) => (
  <View style={[styles.surface, continuousCurve, style]} {...rest}>
    <View style={[styles.inner, contentStyle]}>{children}</View>
  </View>
)

export const Toggle = ({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  readonly value: boolean
  readonly onValueChange: (next: boolean) => void
  readonly accessibilityLabel?: string
}) => {
  const enabled = useMotionEnabled()
  const progress = useSharedValue(value ? 1 : 0)

  useEffect(() => {
    progress.value = enabled
      ? withSpring(value ? 1 : 0, motion.spring.selection)
      : value
        ? 1
        : 0
  }, [enabled, progress, value])

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 20 }],
  }))

  const fillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))

  return (
    <PressableScale
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      scaleTo={motion.scale.button}
      onPress={() => onValueChange(!value)}
      hitSlop={8}
    >
      <View style={styles.toggleTrack}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.passThrough, fillStyle]}>
          <LinearGradient
            colors={[...gradients.brand]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View style={[styles.toggleThumb, thumbStyle]} />
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  shellLiquid: { borderRadius: radii.lg },
  shell: {
    overflow: 'hidden',
    borderRadius: radii.lg,
  },
  blurFill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: 'rgba(18, 10, 28, 0.38)',
  },
  surface: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  passThrough: {
    pointerEvents: 'none',
  },
  opaqueFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(36, 20, 58, 0.94)',
  },
  inner: {
    pointerEvents: 'box-none',
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
  },
})
