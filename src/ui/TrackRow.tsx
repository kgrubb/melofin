import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { LibraryItem } from '@/src/services/jellyfin/library'
import { PressableHighlight } from '@/src/theme/motion'
import { colors, radii, spacing, typography } from '@/src/theme/tokens'
import { Artwork } from '@/src/ui/Artwork'

export const TRACK_ROW_HEIGHT = 52 + spacing.sm * 2

export const TrackRow = memo(function TrackRow({
  item,
  artworkUrl,
  onPress,
  onLongPress,
  accessoryLabel,
  index,
  selected = false,
  accessibilityHint,
}: {
  readonly item: Pick<LibraryItem, 'id' | 'name' | 'artists' | 'album' | 'type'>
  readonly artworkUrl?: string
  readonly onPress: () => void
  readonly onLongPress?: () => void
  readonly accessoryLabel?: string
  readonly index?: number
  readonly selected?: boolean
  readonly accessibilityHint?: string
}) {
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
      accessibilityState={selected ? { selected: true } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.row}
      contentStyle={styles.rowInner}
    >
      {index !== undefined ? (
        <Text style={[styles.index, selected ? styles.selected : null]}>{index + 1}</Text>
      ) : (
        <Artwork uri={artworkUrl} style={styles.art} recyclingKey={item.id} />
      )}
      <View style={styles.meta}>
        <Text style={[styles.title, selected ? styles.selected : null]} numberOfLines={1}>
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
})

const styles = StyleSheet.create({
  row: {
    marginHorizontal: -spacing.xs,
  },
  rowInner: {
    height: TRACK_ROW_HEIGHT,
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
  selected: {
    color: colors.accent,
    fontWeight: '700',
  },
})
