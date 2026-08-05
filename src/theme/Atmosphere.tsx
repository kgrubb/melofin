import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import { colors, gradients } from '@/src/theme/tokens'

export const Atmosphere = ({
  children,
  style,
}: {
  readonly children?: ReactNode
  readonly style?: StyleProp<ViewStyle>
}) => (
  <View style={[styles.root, style]}>
    <LinearGradient
      colors={[...gradients.wash]}
      locations={[0, 0.55, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <LinearGradient
      colors={[...gradients.glow]}
      locations={[0, 0.45, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.glow}
    />
    {children}
  </View>
)

export const AccentGradient = ({
  children,
  style,
}: {
  readonly children?: ReactNode
  readonly style?: StyleProp<ViewStyle>
}) => (
  <LinearGradient
    colors={[...gradients.brand]}
    start={{ x: 0, y: 0.5 }}
    end={{ x: 1, y: 0.5 }}
    style={style}
  >
    {children}
  </LinearGradient>
)

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '42%',
    pointerEvents: 'none',
  },
})
