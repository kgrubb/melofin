import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ComponentType } from 'react'
import { colors } from '@/src/theme/tokens'

type Props = {
  readonly style?: StyleProp<ViewStyle>
}

type NativeCastButton = ComponentType<{
  style?: StyleProp<ViewStyle>
  tintColor?: string
}>

const loadCastButton = (): NativeCastButton | null => {
  if (Platform.OS === 'web') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-google-cast') as {
      CastButton?: NativeCastButton
    }
    return mod.CastButton ?? null
  } catch {
    return null
  }
}

const Native = loadCastButton()

/**
 * Native Cast button. Required on iOS 14+ so the user can grant Local Network
 * permission; custom device lists stay empty until that happens once.
 */
export const CastRouteButton = ({ style }: Props) => {
  if (!Native) {
    return <View style={[styles.stub, style]} accessibilityLabel="Chromecast" />
  }
  return (
    <Native
      style={[styles.button, style]}
      tintColor={colors.textSecondary}
    />
  )
}

const styles = StyleSheet.create({
  button: {
    width: 24,
    height: 24,
    tintColor: colors.textSecondary,
  },
  stub: {
    width: 24,
    height: 24,
  },
})
