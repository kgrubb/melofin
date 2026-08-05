import { FlatList, Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toQueueTrack } from '@/src/services/jellyfin/library'
import { useSettingsStore } from '@/src/store/settings'
import { usePlayerStore } from '@/src/store/player'
import { Body, EmptyState, GlassButton, Muted, Screen, Title } from '@/src/ui/primitives'
import { Glass } from '@/src/theme/Glass'
import { radii, scrollUnderChromePad, spacing } from '@/src/theme/tokens'
import { totalSizeBytes } from '@/src/domain/offline'

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets()
  const offlineIndex = useSettingsStore((s) => s.offlineIndex)
  const replaceQueue = usePlayerStore((s) => s.replaceQueue)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const entries = Object.values(offlineIndex.entries).filter((e) => e.complete)
  const used = totalSizeBytes(offlineIndex) / (1024 * 1024 * 1024)
  const budget = offlineIndex.budgetBytes / (1024 * 1024 * 1024)

  return (
    <Screen padBottom={false}>
      <Title>Downloads</Title>
      <Glass style={styles.meter} contentStyle={styles.meterInner}>
        <Muted>
          {used.toFixed(2)} / {budget.toFixed(0)} GB
        </Muted>
      </Glass>
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
            <Glass style={styles.row} contentStyle={styles.rowInner}>
              <View style={styles.meta}>
                <Body>{item.title}</Body>
                <Muted>
                  {item.artist} · {item.kind}
                </Muted>
              </View>
              <GlassButton
                label="Play"
                onPress={() => {
                  replaceQueue(
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
                  setPlaying(true)
                }}
              />
            </Glass>
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
  row: {
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
  },
  rowInner: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  meta: {
    gap: 2,
  },
})
