import { FlatList, Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toQueueTrack } from '@/src/services/jellyfin/library'
import { useSettingsStore } from '@/src/store/settings'
import { usePlayerStore } from '@/src/store/player'
import { Body, EmptyState, Muted, Screen, Title } from '@/src/ui/primitives'
import { Surface } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { colors, motion, radii, scrollUnderChromePad, spacing } from '@/src/theme/tokens'
import { totalSizeBytes } from '@/src/domain/offline'

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets()
  const offlineIndex = useSettingsStore((s) => s.offlineIndex)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const entries = Object.values(offlineIndex.entries).filter((e) => e.complete)
  const used = totalSizeBytes(offlineIndex) / (1024 * 1024 * 1024)
  const budget = offlineIndex.budgetBytes / (1024 * 1024 * 1024)

  return (
    <Screen padBottom={false}>
      <Title>Downloads</Title>
      <Surface style={styles.meter} contentStyle={styles.meterInner}>
        <Muted>
          {used.toFixed(2)} / {budget.toFixed(0)} GB
        </Muted>
      </Surface>
      {entries.length === 0 ? (
        <EmptyState title="No downloads" message="Download from an album or playlist." />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.itemId}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: scrollUnderChromePad(insets.bottom) },
          ]}
          windowSize={7}
          maxToRenderPerBatch={8}
          initialNumToRender={6}
          removeClippedSubviews={Platform.OS !== 'web'}
          renderItem={({ item }) => (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.title}`}
              scaleTo={motion.scale.card}
              onPress={() => {
                playQueue(
                  [
                    toQueueTrack(
                      {
                        id: item.itemId,
                        name: item.title,
                        type: 'Audio',
                        artists: [item.artist],
                        album: item.album,
                        durationMs: item.durationMs,
                      },
                      item.artworkPath,
                    ),
                  ],
                  0,
                )
              }}
              style={styles.rowPress}
            >
              <Surface style={styles.row} contentStyle={styles.rowInner}>
                <View style={styles.meta}>
                  <Body>{item.title}</Body>
                  <Muted>
                    {item.artist} · {item.kind}
                  </Muted>
                </View>
                <Icon name="play.fill" tintColor={colors.text} size={22} />
              </Surface>
            </PressableScale>
          )}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  meter: {
    marginBottom: spacing.md,
    borderRadius: radii.md,
  },
  meterInner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  rowPress: {
    marginBottom: spacing.sm,
  },
  row: {
    borderRadius: radii.lg,
  },
  rowInner: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
})
