import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'
import type { LibraryItem } from '@/src/services/jellyfin/library'
import { PressableHighlight } from '@/src/theme/motion'
import { colors, radii, spacing, typography } from '@/src/theme/tokens'

export const TrackRow = ({
  item,
  artworkUrl,
  onPress,
  onLongPress,
  accessoryLabel,
  index,
  accessibilityHint,
}: {
  readonly item: LibraryItem
  readonly artworkUrl?: string
  readonly onPress: () => void
  readonly onLongPress?: () => void
  readonly accessoryLabel?: string
  readonly index?: number
  readonly accessibilityHint?: string
}) => {
  const subtitle =
    item.artists.filter(Boolean).join(', ') || item.album || undefined
  const a11y =
    subtitle && item.type !== 'MusicArtist'
      ? `${item.name} by ${subtitle}`
      : item.name

  return (
    <PressableHighlight
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.row}
      contentStyle={styles.rowInner}
    >
      {index !== undefined ? (
        <Text style={styles.index}>{index + 1}</Text>
      ) : artworkUrl ? (
        <Image source={{ uri: artworkUrl }} style={styles.art} contentFit="cover" />
      ) : (
        <View style={[styles.art, styles.artFallback]} />
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>
          {item.name}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {accessoryLabel ? <Text style={styles.accessory}>{accessoryLabel}</Text> : null}
    </PressableHighlight>
  )
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: -spacing.xs,
  },
  rowInner: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  index: {
    width: 28,
    textAlign: 'center',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    fontSize: 14,
    fontWeight: '600',
  },
  art: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
  },
  artFallback: {
    backgroundColor: colors.elevated,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  accessory: {
    color: colors.textSecondary,
    fontSize: 12,
  },
})
