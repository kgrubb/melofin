import { Image, type ImageProps, type ImageStyle } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, View, type StyleProp } from 'react-native'
import { colors } from '@/src/theme/tokens'

/** Mark ratios from `scripts/render-icon.py` (1024 canvas). */
const BAR_W = 168
const GAP = 44
const OUTER_H = 540
const INNER_H = 300
const MARK_W = BAR_W * 3 + GAP * 2
const MARK_H = OUTER_H
const MARK_FILL = 'rgba(248, 244, 255, 0.18)'

type ArtworkProps = {
  readonly uri?: string
  readonly style?: StyleProp<ImageStyle>
  readonly recyclingKey?: string
  readonly cacheKey?: string
} & Pick<ImageProps, 'contentFit' | 'cachePolicy' | 'priority' | 'allowDownscaling'>

const ArtworkPlaceholder = ({
  style,
}: {
  readonly style?: StyleProp<ImageStyle>
}) => (
  <View
    accessible={false}
    importantForAccessibility="no"
    style={[styles.plate, style]}
  >
    <View pointerEvents="none" style={styles.mark}>
      <View style={[styles.bar, styles.barOuter, styles.barLeft]} />
      <View style={[styles.bar, styles.barInner, styles.barMid]} />
      <View style={[styles.bar, styles.barOuter, styles.barRight]} />
    </View>
  </View>
)

export const Artwork = ({
  uri,
  style,
  recyclingKey,
  cacheKey,
  contentFit = 'cover',
  cachePolicy = 'memory-disk',
  ...imageProps
}: ArtworkProps) => {
  const [failedUri, setFailedUri] = useState<string | null>(null)
  if (!uri || failedUri === uri) {
    return <ArtworkPlaceholder style={style} />
  }
  return (
    <Image
      {...imageProps}
      source={cacheKey ? { uri, cacheKey } : { uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
      recyclingKey={recyclingKey}
      onError={() => setFailedUri(uri)}
    />
  )
}

const styles = StyleSheet.create({
  plate: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
  },
  mark: {
    width: '40%',
    aspectRatio: MARK_W / MARK_H,
  },
  bar: {
    position: 'absolute',
    width: `${(BAR_W / MARK_W) * 100}%`,
    borderRadius: 999,
    backgroundColor: MARK_FILL,
  },
  barOuter: {
    top: 0,
    bottom: 0,
  },
  barInner: {
    top: `${((OUTER_H - INNER_H) / OUTER_H) * 100}%`,
    bottom: 0,
  },
  barLeft: {
    left: 0,
  },
  barMid: {
    left: `${((BAR_W + GAP) / MARK_W) * 100}%`,
  },
  barRight: {
    right: 0,
  },
})
