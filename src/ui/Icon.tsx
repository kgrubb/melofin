import { SymbolView } from 'expo-symbols'
import {
  Platform,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

/** SF Symbol name → Material Symbols name for Android/web */
const MATERIAL: Record<string, string> = {
  house: 'home',
  'house.fill': 'home',
  magnifyingglass: 'search',
  'rectangle.stack': 'library_music',
  'rectangle.stack.fill': 'library_music',
  'arrow.down.circle': 'download',
  'arrow.down.circle.fill': 'download_for_offline',
  'gearshape.fill': 'settings',
  'chevron.left': 'chevron_left',
  'chevron.down': 'expand_more',
  'play.fill': 'play_arrow',
  'pause.fill': 'pause',
  'forward.fill': 'skip_next',
  'backward.fill': 'skip_previous',
  shuffle: 'shuffle',
  'heart.fill': 'favorite',
  heart: 'favorite_border',
  repeat: 'repeat',
  'repeat.1': 'repeat_one',
  'play.circle.fill': 'play_circle',
  'pause.circle.fill': 'pause_circle',
}

type Props = {
  readonly name: string
  readonly size?: number
  readonly tintColor?: ColorValue
  readonly style?: StyleProp<ViewStyle>
}

/** Material Symbols on Android/web lack FILL, so play_arrow is outline-only. */
const SolidPlay = ({
  size,
  color,
  style,
}: {
  readonly size: number
  readonly color?: string
  readonly style?: StyleProp<ViewStyle>
}) => {
  const height = size * 0.72
  const width = size * 0.58
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          width: 0,
          height: 0,
          marginLeft: size * 0.06,
          borderStyle: 'solid',
          borderTopWidth: height / 2,
          borderBottomWidth: height / 2,
          borderLeftWidth: width,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: color ?? '#000',
        }}
      />
    </View>
  )
}

export const Icon = ({ name, size = 22, tintColor, style }: Props) => {
  const material = MATERIAL[name] ?? name.split('.').join('_').split('-').join('_')
  const color = tintColor == null ? undefined : String(tintColor)
  // SF Symbols play.fill is solid on iOS. Material Symbols play_arrow is outline.
  if (name === 'play.fill' && Platform.OS !== 'ios') {
    return <SolidPlay size={size} color={color} style={style} />
  }
  return (
    <SymbolView
      // expo-symbols types SF Symbols narrowly; Material names are resolved at runtime on web/android.
      name={{ ios: name, android: material, web: material } as never}
      size={size}
      tintColor={color}
      style={style}
      fallback={
        <Text style={{ color, fontSize: size * 0.85, lineHeight: size } as TextStyle}>●</Text>
      }
    />
  )
}
