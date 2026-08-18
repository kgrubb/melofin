import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, radii } from '@/src/theme/tokens'
import { Artwork } from '@/src/ui/Artwork'

export const MixCollage = memo(function MixCollage({
  arts,
  size,
  radius = radii.cover,
  recyclingKey,
  plate = true,
}: {
  readonly arts: readonly (string | undefined)[]
  readonly size: number
  readonly radius?: number
  readonly recyclingKey?: string
  readonly plate?: boolean
}) {
  const filled = arts.filter(Boolean)
  if (filled.length < 2) {
    return (
      <Artwork
        uri={filled[0]}
        recyclingKey={recyclingKey}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    )
  }
  const cell = Math.ceil(size / 2)
  return (
    <View
      style={[
        styles.collage,
        !plate ? styles.collageClear : null,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      {[0, 1, 2, 3].map((index) => (
        <View
          key={`c-${index}`}
          style={[
            styles.cell,
            {
              width: cell,
              height: cell,
              top: index < 2 ? 0 : cell,
              left: index % 2 === 0 ? 0 : cell,
            },
          ]}
        >
          <Artwork
            uri={filled[index % filled.length]}
            recyclingKey={recyclingKey ? `${recyclingKey}-${index}` : undefined}
            style={styles.cellArt}
          />
        </View>
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  collage: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  collageClear: {
    backgroundColor: 'transparent',
  },
  cell: {
    position: 'absolute',
    overflow: 'hidden',
  },
  cellArt: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
})
