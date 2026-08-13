import { requireNativeViewManager } from 'expo-modules-core'
import type { ComponentType } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export type AirPlayRoutePickerProps = {
  readonly tintColor?: string
  readonly activeTintColor?: string
  readonly prioritizesVideoDevices?: boolean
  readonly style?: StyleProp<ViewStyle>
  readonly onRouteChanged?: (event: {
    nativeEvent: { routeName: string | null }
  }) => void
}

export const NativeAirPlayRoutePicker =
  requireNativeViewManager('AirPlayRoutePicker') as ComponentType<AirPlayRoutePickerProps>
