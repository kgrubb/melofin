import { SymbolView, type SFSymbol } from 'expo-symbols'
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

type Props = {
  readonly name: string
  readonly size?: number
  readonly tintColor?: ColorValue
  readonly style?: StyleProp<ViewStyle>
  /** SF Symbol weight. Defaults to medium (semibold reads heavy on transport). */
  readonly weight?: 'regular' | 'medium' | 'semibold'
}

const box = (size: number, style?: StyleProp<ViewStyle>) =>
  [{ width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const }, style]

/** Material play_arrow is outline-only. Keep a solid triangle off-iOS. */
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
    <View style={box(size, style)}>
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

const SolidPause = ({
  size,
  color,
  style,
}: {
  readonly size: number
  readonly color?: string
  readonly style?: StyleProp<ViewStyle>
}) => {
  const barW = Math.max(3, Math.round(size * 0.22))
  const barH = size * 0.62
  const gap = Math.max(3, Math.round(size * 0.14))
  return (
    <View style={[box(size, style), { flexDirection: 'row', gap }]}>
      <View style={{ width: barW, height: barH, borderRadius: barW / 2, backgroundColor: color }} />
      <View style={{ width: barW, height: barH, borderRadius: barW / 2, backgroundColor: color }} />
    </View>
  )
}

/** Vertical bar + triangle for track previous/next (not +/-10s double-chevron). */
const TrackSkip = ({
  direction,
  size,
  color,
  style,
}: {
  readonly direction: 'backward' | 'forward'
  readonly size: number
  readonly color?: string
  readonly style?: StyleProp<ViewStyle>
}) => {
  const tint = color ?? '#000'
  const barW = Math.max(2, Math.round(size * 0.12))
  const barH = size * 0.58
  const triH = size * 0.58
  const triW = size * 0.42
  const gap = Math.max(1, Math.round(size * 0.06))

  const bar = (
    <View
      style={{
        width: barW,
        height: barH,
        borderRadius: barW / 2,
        backgroundColor: tint,
      }}
    />
  )
  const triangle = (
    <View
      style={{
        width: 0,
        height: 0,
        borderStyle: 'solid',
        borderTopWidth: triH / 2,
        borderBottomWidth: triH / 2,
        borderLeftWidth: triW,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: tint,
      }}
    />
  )

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          transform: direction === 'backward' ? [{ scaleX: -1 }] : undefined,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
        {triangle}
        {bar}
      </View>
    </View>
  )
}

/** Readable off-iOS stand-ins for the SF names Melio actually uses. */
const FALLBACK_GLYPH: Record<string, string> = {
  shuffle: '⇄',
  heart: '♡',
  'heart.fill': '♥',
  trash: '⌫',
  'moon.zzz': '☾',
  'quote.bubble': '❝',
  house: '⌂',
  'house.fill': '⌂',
  magnifyingglass: '⌕',
  'rectangle.stack': '▤',
  'rectangle.stack.fill': '▦',
  'arrow.down.circle': '↓',
  'arrow.down.circle.fill': '↓',
  'checkmark.circle': '✓',
  'checkmark.circle.fill': '✓',
  repeat: '↻',
  'repeat.1': '↻1',
  'chevron.left': '‹',
  'chevron.down': '⌄',
  'chevron.backward': '‹',
  xmark: '✕',
  ellipsis: '···',
  plus: '+',
  'speaker.wave.2': '🔊',
  'speaker.wave.2.fill': '🔊',
  airplayaudio: '⇪',
  checkmark: '✓',
  'chevron.right': '›',
  infinity: '∞',
  'slider.horizontal.3': '☰',
  'line.3.horizontal': '≡',
  'minus.circle.fill': '−',
  waveform: '∿',
  'arrow.triangle.2.circlepath': '↻',
  'person.crop.circle': '☺',
  'rectangle.portrait.and.arrow.right': '⎋',
  iphone: '▢',
  tv: '▤',
  hifispeaker: '♪',
}

const FallbackGlyph = ({
  name,
  size,
  color,
  style,
}: {
  readonly name: string
  readonly size: number
  readonly color?: string
  readonly style?: StyleProp<ViewStyle>
}) => {
  const glyph = FALLBACK_GLYPH[name] ?? '•'
  return (
    <View style={box(size, style)}>
      <Text
        style={
          {
            color,
            fontSize: size * (glyph.length > 1 ? 0.62 : 0.78),
            lineHeight: size,
            fontWeight: '600',
            textAlign: 'center',
          } as TextStyle
        }
      >
        {glyph}
      </Text>
    </View>
  )
}

const VectorFallback = ({
  name,
  size,
  color,
  style,
}: {
  readonly name: string
  readonly size: number
  readonly color?: string
  readonly style?: StyleProp<ViewStyle>
}) => {
  if (name === 'play.fill') return <SolidPlay size={size} color={color} style={style} />
  if (name === 'pause.fill') return <SolidPause size={size} color={color} style={style} />
  if (name === 'backward.end.fill' || name === 'forward.end.fill') {
    return (
      <TrackSkip
        direction={name === 'forward.end.fill' ? 'forward' : 'backward'}
        size={size}
        color={color}
        style={style}
      />
    )
  }
  // Legacy aliases still used in a few call sites.
  if (name === 'backward.fill' || name === 'forward.fill') {
    return (
      <TrackSkip
        direction={name === 'forward.fill' ? 'forward' : 'backward'}
        size={size}
        color={color}
        style={style}
      />
    )
  }
  return <FallbackGlyph name={name} size={size} color={color} style={style} />
}

/**
 * SDK 54 expo-symbols quirks:
 * - `name` must be a string SF Symbol (SDK 55 `{ ios, android, web }` objects
 *   fail native lookup -> empty/white blobs).
 * - Native SF Symbol point size is stuck at ~17pt. Wrap + scaleAspectFit so the
 *   glyph scales without the stretch that scaleToFill causes on chevrons.
 */
export const Icon = ({
  name,
  size = 22,
  tintColor,
  style,
  weight = 'medium',
}: Props) => {
  const color = tintColor == null ? undefined : String(tintColor)

  // Play/pause stay geometric so weight/size match across platforms.
  // Prev/next use real SF Symbols on iOS (same family as lock-screen controls).
  if (name === 'play.fill' || name === 'pause.fill') {
    return <VectorFallback name={name} size={size} color={color} style={style} />
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={[{ width: size, height: size }, style]}>
        <SymbolView
          name={name as SFSymbol}
          size={size}
          tintColor={color}
          weight={weight}
          type="monochrome"
          resizeMode="scaleAspectFit"
          style={StyleSheet.absoluteFillObject}
          fallback={<VectorFallback name={name} size={size} color={color} />}
        />
      </View>
    )
  }

  return <VectorFallback name={name} size={size} color={color} style={style} />
}
