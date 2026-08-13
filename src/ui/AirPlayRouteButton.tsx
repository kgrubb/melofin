import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ComponentType } from 'react'
import { notifyAirPlayRoute } from '@/src/cast/providers/airplay'
import { colors } from '@/src/theme/tokens'

type Props = {
  readonly style?: StyleProp<ViewStyle>
}

type NativeProps = {
  readonly tintColor?: string
  readonly activeTintColor?: string
  readonly prioritizesVideoDevices?: boolean
  readonly style?: StyleProp<ViewStyle>
  readonly onRouteChanged?: (event: {
    nativeEvent: { routeName: string | null }
  }) => void
}

const loadNative = (): ComponentType<NativeProps> | null => {
  if (Platform.OS !== 'ios') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('airplay-route-picker') as {
      NativeAirPlayRoutePicker: ComponentType<NativeProps>
    }
    return mod.NativeAirPlayRoutePicker
  } catch {
    return null
  }
}

/** System AVRoutePickerView host. Stub when the native module isn’t linked yet. */
export const AirPlayRouteButton = ({ style }: Props) => {
  const NativeAirPlay = loadNative()
  if (!NativeAirPlay) {
    return <View style={[styles.stub, style]} accessibilityLabel="AirPlay" />
  }
  return (
    <NativeAirPlay
      style={[styles.picker, style]}
      tintColor={colors.textSecondary}
      activeTintColor={colors.accent}
      prioritizesVideoDevices={false}
      onRouteChanged={(event) => {
        notifyAirPlayRoute(event.nativeEvent.routeName)
      }}
    />
  )
}

const styles = StyleSheet.create({
  picker: {
    width: 44,
    height: 44,
  },
  stub: {
    width: 44,
    height: 44,
  },
})
