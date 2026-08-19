import { memo, useCallback, useMemo, useState } from 'react'
import { Alert, Platform, StyleSheet, Text, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toQueueTrack } from '@/src/services/jellyfin/library'
import { removeDownloadedTrack } from '@/src/offline/downloader'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { usePlayerStore } from '@/src/store/player'
import { Artwork } from '@/src/ui/Artwork'
import { EmptyState, Screen, Title } from '@/src/ui/primitives'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { Surface } from '@/src/theme/Glass'
import { PressableHighlight, PressableScale } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { MoreButton } from '@/src/ui/NavChrome'
import { presentTrackActions } from '@/src/ui/PlaylistActions'
import { buildTrackActions } from '@/src/ui/trackActions'
import { SegmentControl } from '@/src/ui/SegmentControl'
import { TRACK_ROW_HEIGHT, TrackRow } from '@/src/ui/TrackRow'
import { colors, motion, radii, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'
import { emptySyncPackIndex, removeSyncPack } from '@/src/domain/syncPack'
import type { OfflineEntry } from '@/src/domain/offline'
import type { QueueTrack } from '@/src/domain/queue'
import {
  DOWNLOAD_BUDGET_GB,
  DOWNLOAD_SEGMENTS,
  buildDownloadAlbums,
  buildDownloadPlaylists,
  bytesFromGb,
  completeEntriesForIds,
  downloadsPackTrackIds,
  keptOfflineEntries,
  nearestBudgetGb,
  playAllEntries,
  storageMeter,
  type DownloadCollection,
  type DownloadSegment,
} from '@/src/domain/downloadsView'

/** FlashList v2 enables this by default. It jumps the list when offline index publishes. */
const LIST_SCROLL = { disabled: true } as const

const queueTrackFromEntry = (entry: OfflineEntry): QueueTrack =>
  toQueueTrack(
    {
      id: entry.itemId,
      name: entry.title,
      type: 'Audio',
      artists: entry.artist ? [entry.artist] : [],
      album: entry.album || undefined,
      durationMs: entry.durationMs,
    },
    entry.artworkPath,
  )

const OfflineCollectionRow = memo(function OfflineCollectionRow({
  item,
  onPress,
  onLongPress,
}: {
  readonly item: DownloadCollection
  readonly onPress: () => void
  readonly onLongPress: () => void
}) {
  const downloading = item.progress < 1 && item.totalCount > 0
  return (
    <PressableHighlight
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.artist}, ${item.subtitle}`}
      accessibilityHint="Plays downloaded songs. Long press for more actions."
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.collectionPress}
      contentStyle={styles.collectionInner}
    >
      <Artwork uri={item.artworkUrl} style={styles.art} recyclingKey={item.id} />
      <View style={styles.meta}>
        <Text style={styles.collectionTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.collectionSubtitle} numberOfLines={1}>
          {item.artist ? `${item.artist} · ${item.subtitle}` : item.subtitle}
        </Text>
      </View>
      <Icon
        name={downloading ? 'arrow.down.circle' : 'checkmark.circle'}
        tintColor={downloading ? colors.accent : colors.textSecondary}
        size={18}
      />
    </PressableHighlight>
  )
})

export default function DownloadsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const session = useSessionStore((s) => s.session)
  const offlineIndex = useSettingsStore((s) => s.offlineIndex)
  const setOfflineIndex = useSettingsStore((s) => s.setOfflineIndex)
  const syncPacks = useSettingsStore((s) => s.syncPacks)
  const setSyncPacks = useSettingsStore((s) => s.setSyncPacks)
  const setBudgetBytes = useSettingsStore((s) => s.setBudgetBytes)
  const budgetBytes = useSettingsStore((s) => s.budgetBytes)
  const clearOfflineCache = useSettingsStore((s) => s.clearOfflineCache)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const enqueueTracks = usePlayerStore((s) => s.enqueueTracks)
  const playNextTracks = usePlayerStore((s) => s.playNextTracks)
  const [segment, setSegment] = useState<DownloadSegment>('albums')

  const packTrackIds = useMemo(() => downloadsPackTrackIds(syncPacks), [syncPacks])
  const packs = useMemo(() => Object.values(syncPacks.packs), [syncPacks])
  const songs = useMemo(
    () => keptOfflineEntries(offlineIndex.entries),
    [offlineIndex.entries],
  )
  const albums = useMemo(
    () => buildDownloadAlbums(offlineIndex.entries, packs),
    [offlineIndex.entries, packs],
  )
  const playlists = useMemo(
    () => buildDownloadPlaylists(offlineIndex.entries, packs),
    [offlineIndex.entries, packs],
  )
  const meter = useMemo(
    () => storageMeter({ ...offlineIndex, budgetBytes }, packTrackIds),
    [budgetBytes, offlineIndex, packTrackIds],
  )
  const hasLibrary = albums.length > 0 || playlists.length > 0 || songs.length > 0
  const listPad = useMemo(
    () => ({ paddingBottom: scrollUnderChromePad(insets.bottom) }),
    [insets.bottom],
  )

  const playEntries = useCallback(
    (entries: readonly OfflineEntry[], startIndex = 0, shuffle?: boolean) => {
      if (entries.length === 0) return
      playQueue(
        entries.map(queueTrackFromEntry),
        shuffle === true ? Math.floor(Math.random() * entries.length) : startIndex,
        null,
        shuffle,
      )
    },
    [playQueue],
  )

  const deleteEntry = useCallback(
    (itemId: string, title: string) => {
      Alert.alert('Remove Download?', `Remove "${title}" from this device.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void removeDownloadedTrack(itemId).then((result) => {
              if (!result.ok) {
                Alert.alert("Couldn't remove download", result.error.message)
                return
              }
              void setOfflineIndex(result.value)
            })
          },
        },
      ])
    },
    [setOfflineIndex],
  )

  const removeCollection = useCallback(
    (item: DownloadCollection) => {
      Alert.alert(
        'Remove from This Device?',
        `Delete downloaded songs in "${item.title}".`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const ids = completeEntriesForIds(
                  item.trackIds,
                  useSettingsStore.getState().offlineIndex.entries,
                )
                for (const entry of ids) {
                  const result = await removeDownloadedTrack(entry.itemId)
                  if (!result.ok) {
                    Alert.alert("Couldn't remove download", result.error.message)
                    return
                  }
                  await setOfflineIndex(result.value)
                }
                if (item.packId) {
                  await setSyncPacks(
                    removeSyncPack(useSettingsStore.getState().syncPacks, item.packId),
                  )
                }
              })()
            },
          },
        ],
      )
    },
    [setOfflineIndex, setSyncPacks],
  )

  const viewCollection = useCallback(
    (item: DownloadCollection) => {
      if (!item.collectionId) return
      router.push(
        item.kind === 'playlist'
          ? `/(app)/(main)/playlist/${item.collectionId}`
          : `/(app)/(main)/album/${item.collectionId}`,
      )
    },
    [router],
  )

  const openCollection = useCallback(
    (item: DownloadCollection) => {
      const playable = completeEntriesForIds(item.trackIds, offlineIndex.entries)
      if (playable.length > 0) {
        playEntries(playable)
        return
      }
      viewCollection(item)
    },
    [offlineIndex.entries, playEntries, viewCollection],
  )

  const onCollectionLongPress = useCallback(
    (item: DownloadCollection) => {
      const playable = completeEntriesForIds(item.trackIds, offlineIndex.entries)
      presentTrackActions(item.title, [
        ...(playable.length > 0
          ? [
              {
                text: 'Play',
                onPress: () => playEntries(playable, 0, false),
              },
              {
                text: 'Shuffle',
                onPress: () => playEntries(playable, 0, true),
              },
            ]
          : []),
        ...(item.collectionId
          ? [
              {
                text: item.kind === 'playlist' ? 'View Playlist' : 'View Album',
                onPress: () => viewCollection(item),
              },
            ]
          : []),
        {
          text: 'Remove from This Device',
          style: 'destructive' as const,
          onPress: () => setTimeout(() => removeCollection(item), 50),
        },
      ])
    },
    [offlineIndex.entries, playEntries, removeCollection, viewCollection],
  )

  const onSongLongPress = useCallback(
    (item: OfflineEntry) => {
      const track = queueTrackFromEntry(item)
      presentTrackActions(
        item.title,
        buildTrackActions({
          onPlayNext: () => playNextTracks([track]),
          onAddToQueue: () => enqueueTracks([track]),
          extra: [
            {
              text: 'Remove Download',
              style: 'destructive',
              onPress: () => setTimeout(() => deleteEntry(item.itemId, item.title), 50),
            },
          ],
        }),
      )
    },
    [deleteEntry, enqueueTracks, playNextTracks],
  )

  const pickBudget = useCallback(() => {
    const current = nearestBudgetGb(budgetBytes)
    Alert.alert(
      'Storage Limit',
      'How much music Melofin may keep on this device, including playback cache.',
      [
        ...DOWNLOAD_BUDGET_GB.map((gb) => ({
          text: `${current === gb ? '✓ ' : ''}${gb} GB`,
          onPress: () => {
            if (gb !== current) void setBudgetBytes(bytesFromGb(gb))
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    )
  }, [budgetBytes, setBudgetBytes])

  const openMore = useCallback(() => {
    presentTrackActions('Downloads', [
      { text: 'Storage Limit', onPress: () => setTimeout(pickBudget, 50) },
      ...(hasLibrary || meter.usedBytes > 0
        ? [
            {
              text: 'Remove All Downloads',
              style: 'destructive' as const,
              onPress: () => {
                setTimeout(() => {
                  Alert.alert(
                    'Remove All Downloads?',
                    'This deletes music saved on this device. Playback cache is cleared too.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove All',
                        style: 'destructive',
                        onPress: () => {
                          const scope = session
                            ? { serverUrl: session.serverUrl, userId: session.userId }
                            : undefined
                          void (async () => {
                            try {
                              await clearOfflineCache(scope)
                              if (
                                Object.values(
                                  useSettingsStore.getState().offlineIndex.entries,
                                ).some((entry) => entry.complete)
                              ) {
                                Alert.alert(
                                  "Couldn't remove downloads",
                                  'Some files may still be on this device.',
                                )
                                return
                              }
                              await setSyncPacks(emptySyncPackIndex())
                            } catch {
                              Alert.alert(
                                "Couldn't remove downloads",
                                'Some files may still be on this device.',
                              )
                            }
                          })()
                        },
                      },
                    ],
                  )
                }, 50)
              },
            },
          ]
        : []),
    ])
  }, [clearOfflineCache, hasLibrary, meter.usedBytes, pickBudget, session, setSyncPacks])

  const renderAlbum = useCallback(
    ({ item }: { item: DownloadCollection }) => (
      <OfflineCollectionRow
        item={item}
        onPress={() => openCollection(item)}
        onLongPress={() => onCollectionLongPress(item)}
      />
    ),
    [onCollectionLongPress, openCollection],
  )

  const renderSong = useCallback(
    ({ item, index }: { item: OfflineEntry; index: number }) => (
      <TrackRow
        item={{
          id: item.itemId,
          name: item.title,
          type: 'Audio',
          artists: item.artist ? [item.artist] : [],
          album: item.album || undefined,
        }}
        artworkUrl={item.artworkPath}
        onPress={() => playEntries(songs, index)}
        onLongPress={() => onSongLongPress(item)}
        accessibilityHint="Long press for play next, queue, or remove download"
      />
    ),
    [onSongLongPress, playEntries, songs],
  )

  const collections = segment === 'playlists' ? playlists : albums
  const collectionEmptyTitle = segment === 'playlists' ? 'No playlists' : 'No albums'
  const collectionEmptyMessage =
    segment === 'playlists'
      ? 'Keep a playlist offline from its screen.'
      : 'Keep an album offline from its screen, or download songs to group them here.'

  return (
    <Screen padBottom={false}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Title>Downloads</Title>
        </View>
        <MoreButton label="Downloads options" onPress={openMore} />
      </View>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={meter.accessibilityLabel}
        accessibilityHint="Opens storage limit options"
        scaleTo={motion.scale.card}
        onPress={pickBudget}
        style={styles.meterPress}
      >
        <Surface style={styles.meter} contentStyle={styles.meterInner}>
          <View style={styles.meterText}>
            <Text style={styles.meterTitle}>On This Device</Text>
            <Text
              style={[styles.meterUsed, meter.overBudget ? styles.meterOver : null]}
            >
              {meter.usedLabel} of {meter.budgetLabel}
            </Text>
          </View>
          <Text style={styles.meterDetail} numberOfLines={1}>
            {meter.detail}
          </Text>
          <View
            style={styles.meterTrack}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View
              style={[
                styles.meterFill,
                meter.overBudget ? styles.meterFillOver : null,
                { transform: [{ scaleX: meter.ratio }] },
              ]}
            />
          </View>
        </Surface>
      </PressableScale>

      {hasLibrary ? (
        <>
          {songs.length > 0 ? (
            <View style={styles.actions}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Play all downloads"
                scaleTo={motion.scale.button}
                onPress={() => playEntries(playAllEntries(songs), 0, false)}
                style={styles.actionPress}
              >
                <AccentGradient style={styles.actionPrimary}>
                  <Icon name="play.fill" tintColor={colors.onAccent} size={16} />
                  <Text style={styles.actionPrimaryLabel}>Play</Text>
                </AccentGradient>
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Shuffle all downloads"
                scaleTo={motion.scale.button}
                onPress={() => playEntries(playAllEntries(songs), 0, true)}
                style={styles.actionPress}
              >
                <View style={styles.actionSecondary}>
                  <Icon name="shuffle" tintColor={colors.text} size={16} />
                  <Text style={styles.actionSecondaryLabel}>Shuffle</Text>
                </View>
              </PressableScale>
            </View>
          ) : null}

          <SegmentControl
            values={DOWNLOAD_SEGMENTS}
            value={segment}
            onChange={setSegment}
          />

          {segment === 'songs' ? (
            songs.length === 0 ? (
              <EmptyState
                title="No songs"
                message="Downloaded albums and playlists show up here as songs too."
              />
            ) : (
              <View style={styles.flex}>
                <FlashList
                  key="songs"
                  data={songs}
                  keyExtractor={(item) => item.itemId}
                  style={styles.flex}
                  showsVerticalScrollIndicator={false}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={listPad}
                  drawDistance={250}
                  maintainVisibleContentPosition={LIST_SCROLL}
                  renderItem={renderSong}
                />
              </View>
            )
          ) : collections.length === 0 ? (
            <EmptyState title={collectionEmptyTitle} message={collectionEmptyMessage} />
          ) : (
            <View style={styles.flex}>
              <FlashList
                key={segment}
                data={collections}
                keyExtractor={(item) => item.id}
                style={styles.flex}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={listPad}
                drawDistance={250}
                maintainVisibleContentPosition={LIST_SCROLL}
                renderItem={renderAlbum}
              />
            </View>
          )}
        </>
      ) : (
        <View
          style={styles.empty}
          accessible
          accessibilityRole="summary"
          accessibilityLabel="Nothing saved yet. On an album or playlist, tap the download button to keep it on this device."
        >
          <View style={styles.emptyGlyph} accessibilityElementsHidden>
            <Icon name="arrow.down.circle" tintColor={colors.textSecondary} size={36} />
          </View>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyMessage}>
            On an album or playlist, tap the download button to keep it on this device.
          </Text>
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  meterPress: {
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  meter: {
    borderRadius: radii.lg,
  },
  meterInner: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  meterText: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  meterTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  meterUsed: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  meterOver: {
    color: colors.danger,
    fontWeight: '700',
  },
  meterDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  meterTrack: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    width: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    transformOrigin: 'left center',
  },
  meterFillOver: {
    backgroundColor: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionPress: {
    flex: 1,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  actionPrimary: {
    minHeight: 44,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionPrimaryLabel: {
    color: colors.onAccent,
    fontWeight: '700',
    fontSize: 16,
  },
  actionSecondary: {
    minHeight: 44,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  actionSecondaryLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  flex: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyGlyph: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.subtitle,
    color: colors.text,
    textAlign: 'center',
  },
  emptyMessage: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  collectionPress: {
    marginHorizontal: -spacing.xs,
  },
  collectionInner: {
    height: TRACK_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  art: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : null),
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  collectionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  collectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
})
