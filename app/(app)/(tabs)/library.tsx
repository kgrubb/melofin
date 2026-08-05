import { useCallback, useEffect, useState } from 'react'
import { FlatList, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  artworkUrl,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { useSessionStore } from '@/src/store/session'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { PressableScale, settleEntering, useMotionEnabled } from '@/src/theme/motion'
import {
  EmptyState,
  ErrorState,
  GlassButton,
  LoadingState,
  Muted,
  Screen,
  Title,
} from '@/src/ui/primitives'
import { SegmentControl } from '@/src/ui/SegmentControl'
import { TrackRow } from '@/src/ui/TrackRow'
import { colors, motion, radii, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'

type Segment = 'songs' | 'albums' | 'artists' | 'playlists'

const SEGMENTS: readonly Segment[] = ['songs', 'albums', 'artists', 'playlists']

const itemsForSegment = (
  segment: Segment,
  cache: {
    readonly songs: readonly LibraryItem[]
    readonly albums: readonly LibraryItem[]
    readonly artists: readonly LibraryItem[]
    readonly playlists: readonly LibraryItem[]
  },
): readonly LibraryItem[] => {
  if (segment === 'songs') return cache.songs
  if (segment === 'artists') return cache.artists
  if (segment === 'playlists') return cache.playlists
  return cache.albums
}

const PlaylistCard = ({
  item,
  art,
  width,
  onPress,
}: {
  readonly item: LibraryItem
  readonly art?: string
  readonly width: number
  readonly onPress: () => void
}) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={item.name}
    scaleTo={motion.scale.card}
    onPress={onPress}
    style={[styles.playlistCard, { width }]}
  >
    {art ? (
      <Image source={{ uri: art }} style={[styles.playlistArt, { width, height: width }]} />
    ) : (
      <View style={[styles.playlistArt, styles.playlistArtFallback, { width, height: width }]} />
    )}
    <Text style={styles.playlistTitle} numberOfLines={2}>
      {item.name}
    </Text>
    <Muted>
      {item.childCount !== undefined
        ? `${item.childCount} track${item.childCount === 1 ? '' : 's'}`
        : 'Playlist'}
    </Muted>
  </PressableScale>
)

export default function LibraryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const enabled = useMotionEnabled()
  const context = useSessionStore((s) => s.context)
  const replaceQueue = usePlayerStore((s) => s.replaceQueue)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const songs = useLibraryStore((s) => s.songs)
  const albums = useLibraryStore((s) => s.albums)
  const artists = useLibraryStore((s) => s.artists)
  const playlists = useLibraryStore((s) => s.playlists)
  const syncing = useLibraryStore((s) => s.syncing)
  const syncError = useLibraryStore((s) => s.syncError)
  const hydrated = useLibraryStore((s) => s.hydrated)
  const syncLibrary = useLibraryStore((s) => s.syncLibrary)
  const [segment, setSegment] = useState<Segment>('songs')
  const items = itemsForSegment(segment, { songs, albums, artists, playlists })
  const playlistCardWidth = Math.min(168, (width - spacing.lg * 2 - spacing.md) / 2)

  const refresh = useCallback(() => {
    void syncLibrary('manual')
  }, [syncLibrary])

  useEffect(() => {
    if (!hydrated) void useLibraryStore.getState().hydrate()
  }, [hydrated])

  const artFor = (item: LibraryItem) =>
    context
      ? artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'thumb')
      : undefined

  return (
    <Screen padBottom={false}>
      <Title>Library</Title>
      <SegmentControl values={SEGMENTS} value={segment} onChange={setSegment} />
      {syncing && items.length === 0 ? <LoadingState label="Syncing library" /> : null}
      {syncError && items.length === 0 ? (
        <ErrorState message={syncError} onRetry={refresh} />
      ) : null}
      {!syncing && !syncError && items.length === 0 ? (
        <EmptyState
          title="Library empty"
          message="Pull a fresh sync from your Jellyfin server."
        />
      ) : null}
      {items.length === 0 && !syncing ? (
        <GlassButton label="Sync library" onPress={refresh} />
      ) : null}
      {items.length > 0 ? (
        <Animated.View
          key={segment}
          entering={settleEntering(enabled)}
          style={styles.listWrap}
        >
          {syncError ? (
            <GlassButton label="Retry sync" onPress={refresh} />
          ) : null}
          {segment === 'playlists' ? (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              numColumns={2}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              columnWrapperStyle={styles.playlistRow}
              contentContainerStyle={[
                styles.playlistList,
                { paddingBottom: scrollUnderChromePad(insets.bottom) },
              ]}
              windowSize={7}
              maxToRenderPerBatch={8}
              initialNumToRender={6}
              removeClippedSubviews={Platform.OS !== 'web'}
              renderItem={({ item }) => (
                <PlaylistCard
                  item={item}
                  art={artFor(item)}
                  width={playlistCardWidth}
                  onPress={() => router.push(`/(app)/playlist/${item.id}`)}
                />
              )}
            />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
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
              renderItem={({ item, index }) => (
                <TrackRow
                  item={item}
                  artworkUrl={artFor(item)}
                  onPress={() => {
                    if (segment === 'songs') {
                      const queue = items.map((song) =>
                        toQueueTrack(
                          song,
                          context
                            ? artworkUrl(
                                context,
                                song.imageItemId ?? song.id,
                                song.imageTag,
                                'hero',
                              )
                            : undefined,
                        ),
                      )
                      replaceQueue(queue, index)
                      setPlaying(true)
                      return
                    }
                    if (segment === 'albums') router.push(`/(app)/album/${item.id}`)
                    if (segment === 'artists') router.push(`/(app)/artist/${item.id}`)
                  }}
                />
              )}
            />
          )}
        </Animated.View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  listWrap: {
    flex: 1,
    gap: spacing.sm,
  },
  list: {},
  playlistList: {
    gap: spacing.md,
  },
  playlistRow: {
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  playlistCard: {
    gap: spacing.sm,
  },
  playlistArt: {
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  playlistArtFallback: {
    backgroundColor: colors.elevated,
  },
  playlistTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
})
