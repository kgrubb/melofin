import { useMemo } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { Swipeable } from 'react-native-gesture-handler'
import { useRouter } from 'expo-router'
import { playingIdentity, queueViewTracks, upcomingCount } from '@/src/domain/queue'
import { usePlayerStore } from '@/src/store/player'
import { Glass, Surface } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { CloseChip } from '@/src/ui/NavChrome'
import { presentTrackActions } from '@/src/ui/PlaylistActions'
import { Screen } from '@/src/ui/primitives'
import { Icon } from '@/src/ui/Icon'
import { colors, motion, radii, spacing, typography } from '@/src/theme/tokens'

const indexOf = (identity: string | undefined): number => {
  if (!identity) return -1
  return usePlayerStore
    .getState()
    .tracks.findIndex((track) => playingIdentity(track) === identity)
}

const withIndex = (identity: string | undefined, run: (index: number) => void) => {
  const index = indexOf(identity)
  if (index >= 0) run(index)
}

export default function QueueScreen() {
  const router = useRouter()
  const tracks = usePlayerStore((s) => s.tracks)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const shuffleOrder = usePlayerStore((s) => s.shuffleOrder)
  const clearUpcomingTracks = usePlayerStore((s) => s.clearUpcomingTracks)
  const upcomingCountValue = upcomingCount({
    tracks,
    currentIndex,
    shuffle,
    shuffleOrder,
    repeat: 'off',
  })
  const orderedTracks = useMemo(
    () =>
      queueViewTracks({
        tracks,
        currentIndex,
        shuffle,
        shuffleOrder,
        repeat: 'off',
      }),
    [tracks, currentIndex, shuffle, shuffleOrder],
  )
  const currentKey = playingIdentity(tracks[currentIndex])

  return (
    <Screen padBottom={false}>
      <View style={styles.topBar}>
        <CloseChip
          onPress={() => {
            if (router.canGoBack()) router.back()
          }}
        />
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          Queue
        </Text>
        {upcomingCountValue > 0 ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Clear upcoming"
            scaleTo={motion.scale.button}
            onPress={() => {
              Alert.alert(
                'Clear upcoming?',
                `Remove ${upcomingCountValue} track${upcomingCountValue === 1 ? '' : 's'} after the current song.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => clearUpcomingTracks(),
                  },
                ],
              )
            }}
          >
            <Glass style={styles.clearChip} contentStyle={styles.clearInner} isInteractive>
              <Text style={styles.clearLabel}>Clear</Text>
            </Glass>
          </PressableScale>
        ) : null}
      </View>
      <FlashList
        data={orderedTracks}
        extraData={currentKey}
        keyExtractor={(item, index) => `${item.queueEntryId ?? item.id}-${index}`}
        style={styles.flexList}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        drawDistance={200}
        renderItem={({ item, index }) => {
          const identity = playingIdentity(item)
          const active = identity === currentKey
          return (
            <Swipeable
              overshootRight={false}
              renderRightActions={() => (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.title}`}
                  scaleTo={motion.scale.button}
                  onPress={() =>
                    withIndex(identity, (i) => usePlayerStore.getState().removeTrackAt(i))
                  }
                  style={styles.swipeRemove}
                >
                  <Icon name="trash" tintColor={colors.onAccent} size={22} />
                  <Text style={styles.swipeLabel}>Remove</Text>
                </PressableScale>
              )}
            >
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`${item.title} by ${item.artist}`}
                accessibilityState={{ selected: active }}
                accessibilityHint="Long press for queue actions"
                scaleTo={motion.scale.card}
                onPress={() =>
                  withIndex(identity, (i) => usePlayerStore.getState().playAtIndex(i))
                }
                onLongPress={() => {
                  withIndex(identity, (i) => {
                    const state = usePlayerStore.getState()
                    // Linear move up/down is misleading while the list is shuffle-ordered.
                    const moves =
                      state.shuffle && state.shuffleOrder.length === state.tracks.length
                        ? []
                        : [
                            ...(i > 0
                              ? [
                                  {
                                    text: 'Move up',
                                    onPress: () =>
                                      withIndex(identity, (from) =>
                                        usePlayerStore
                                          .getState()
                                          .moveQueueTrack(from, from - 1),
                                      ),
                                  },
                                ]
                              : []),
                            ...(i < state.tracks.length - 1
                              ? [
                                  {
                                    text: 'Move down',
                                    onPress: () =>
                                      withIndex(identity, (from) =>
                                        usePlayerStore
                                          .getState()
                                          .moveQueueTrack(from, from + 1),
                                      ),
                                  },
                                ]
                              : []),
                          ]
                    presentTrackActions(item.title, [
                      ...moves,
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () =>
                          withIndex(identity, (from) =>
                            usePlayerStore.getState().removeTrackAt(from),
                          ),
                      },
                    ])
                  })
                }}
              >
                <Surface
                  style={[styles.row, active ? styles.rowActive : null]}
                  contentStyle={styles.rowInner}
                >
                  <Text style={[styles.text, active ? styles.active : null]} numberOfLines={2}>
                    {index + 1}. {item.title} — {item.artist}
                  </Text>
                </Surface>
              </PressableScale>
            </Swipeable>
          )
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
    flex: 1,
  },
  clearChip: {
    borderRadius: radii.pill,
  },
  clearInner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  flexList: {
    flex: 1,
  },
  list: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowActive: {
    borderColor: colors.accent,
  },
  rowInner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  text: {
    ...typography.body,
    color: colors.text,
  },
  active: {
    fontWeight: '700',
    color: colors.accent,
  },
  swipeRemove: {
    backgroundColor: colors.danger,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeLabel: {
    ...typography.caption,
    color: colors.onAccent,
    fontWeight: '700',
  },
})
