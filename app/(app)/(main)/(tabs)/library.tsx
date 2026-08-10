import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  artworkUrl,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { createPlaylist, addTracksToPlaylist } from '@/src/services/jellyfin/playlists'
import { playlistStub } from '@/src/domain/playlists'
import { useSessionStore } from '@/src/store/session'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { PressableScale, settleEntering, useMotionEnabled } from '@/src/theme/motion'
import { MoreButton } from '@/src/ui/NavChrome'
import {
  EmptyState,
  ErrorState,
  GlassButton,
  LoadingState,
  Muted,
  Screen,
  Title,
} from '@/src/ui/primitives'
import {
  PlaylistNameModal,
  PlaylistPickerModal,
  presentTrackActions,
} from '@/src/ui/PlaylistActions'
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
  const session = useSessionStore((s) => s.session)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const enqueueTracks = usePlayerStore((s) => s.enqueueTracks)
  const songs = useLibraryStore((s) => s.songs)
  const albums = useLibraryStore((s) => s.albums)
  const artists = useLibraryStore((s) => s.artists)
  const playlists = useLibraryStore((s) => s.playlists)
  const syncing = useLibraryStore((s) => s.syncing)
  const syncError = useLibraryStore((s) => s.syncError)
  const hydrated = useLibraryStore((s) => s.hydrated)
  const syncLibrary = useLibraryStore((s) => s.syncLibrary)
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists)
  const upsertPlaylist = useLibraryStore((s) => s.upsertPlaylist)
  const [segment, setSegment] = useState<Segment>('songs')
  const [nameOpen, setNameOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [seedTrackId, setSeedTrackId] = useState<string | null>(null)
  const [createFromPicker, setCreateFromPicker] = useState(false)
  const [busy, setBusy] = useState(false)
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

  const requireSession = (): boolean => {
    if (context && session) return true
    Alert.alert('Sign in required', 'Sign in to manage playlists.')
    return false
  }

  const openCreate = (trackId?: string, fromPicker = false) => {
    if (!requireSession()) return
    setSeedTrackId(trackId ?? null)
    setCreateFromPicker(fromPicker)
    setPickerOpen(false)
    setNameOpen(true)
  }

  const cancelCreate = () => {
    if (busy) return
    setNameOpen(false)
    if (createFromPicker) {
      setCreateFromPicker(false)
      setPickerOpen(true)
      return
    }
    setSeedTrackId(null)
  }

  const submitCreate = async (name: string) => {
    if (!context || !session || busy) return
    setBusy(true)
    try {
      const result = await createPlaylist(
        context,
        session.userId,
        name,
        seedTrackId ? [seedTrackId] : undefined,
      )
      if (!result.ok) {
        Alert.alert('Couldn’t create playlist', result.error.message)
        return
      }
      await upsertPlaylist({
        ...playlistStub(result.value, name, seedTrackId ? 1 : 0),
        type: 'Playlist',
        artists: [],
        durationMs: 0,
      })
      setNameOpen(false)
      setCreateFromPicker(false)
      setSeedTrackId(null)
      await refreshPlaylists()
      router.push(`/(app)/playlist/${result.value}`)
    } finally {
      setBusy(false)
    }
  }

  const addToPlaylist = async (playlistId: string, trackId: string) => {
    if (!context || !session || busy) return
    setBusy(true)
    try {
      const result = await addTracksToPlaylist(context, session.userId, playlistId, [
        trackId,
      ])
      if (!result.ok) {
        Alert.alert('Couldn’t add to playlist', result.error.message)
        return
      }
      setPickerOpen(false)
      setCreateFromPicker(false)
      setSeedTrackId(null)
      await refreshPlaylists()
    } finally {
      setBusy(false)
    }
  }

  const onSongLongPress = (item: LibraryItem, index: number) => {
    const song = items[index]
    if (!song) return
    const queueTrack = toQueueTrack(
      song,
      context
        ? artworkUrl(context, song.imageItemId ?? song.id, song.imageTag, 'hero')
        : undefined,
    )
    presentTrackActions(item.name, [
      {
        text: 'Add to queue',
        onPress: () => enqueueTracks([queueTrack]),
      },
      {
        text: 'Add to playlist…',
        onPress: () => {
          if (!requireSession()) return
          setSeedTrackId(item.id)
          setCreateFromPicker(false)
          setPickerOpen(true)
        },
      },
    ])
  }

  const openLibraryMenu = () => {
    if (busy) return
    presentTrackActions('Playlists', [
      {
        text: 'New playlist',
        onPress: () => openCreate(),
      },
    ])
  }

  return (
    <Screen padBottom={false}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Title>Library</Title>
        </View>
        {segment === 'playlists' ? (
          <MoreButton
            label="Playlist options"
            onPress={openLibraryMenu}
          />
        ) : null}
      </View>
      <SegmentControl values={SEGMENTS} value={segment} onChange={setSegment} />
      {syncing && items.length === 0 ? <LoadingState label="Syncing library" /> : null}
      {syncError && items.length === 0 ? (
        <ErrorState message={syncError} onRetry={refresh} />
      ) : null}
      {!syncing && !syncError && items.length === 0 && segment !== 'playlists' ? (
        <EmptyState
          title="Library empty"
          message="Tap Sync library to pull from your Jellyfin server."
        />
      ) : null}
      {!syncing && !syncError && items.length === 0 && segment === 'playlists' ? (
        <View style={styles.emptyPlaylists}>
          <EmptyState
            title="No playlists yet"
            message="Tap ··· above to create one, or long-press a song → Add to playlist."
          />
          <GlassButton label="Sync library" onPress={refresh} />
        </View>
      ) : null}
      {items.length === 0 && !syncing && !syncError && segment !== 'playlists' ? (
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
                      playQueue(queue, index)
                      return
                    }
                    if (segment === 'albums') router.push(`/(app)/album/${item.id}`)
                    if (segment === 'artists') router.push(`/(app)/artist/${item.id}`)
                  }}
                  onLongPress={
                    segment === 'songs' ? () => onSongLongPress(item, index) : undefined
                  }
                  accessibilityHint={
                    segment === 'songs' ? 'Long press for playlist actions' : undefined
                  }
                />
              )}
            />
          )}
        </Animated.View>
      ) : null}
      <PlaylistNameModal
        visible={nameOpen}
        title="New playlist"
        busy={busy}
        onCancel={cancelCreate}
        onSubmit={(name) => {
          void submitCreate(name)
        }}
      />
      <PlaylistPickerModal
        visible={pickerOpen}
        playlists={playlists}
        busy={busy}
        onCancel={() => {
          if (busy) return
          setPickerOpen(false)
          setCreateFromPicker(false)
          setSeedTrackId(null)
        }}
        onPick={(playlistId) => {
          if (!seedTrackId) return
          void addToPlaylist(playlistId, seedTrackId)
        }}
        onCreateNew={() => openCreate(seedTrackId ?? undefined, true)}
      />
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
  emptyPlaylists: {
    flex: 1,
    gap: spacing.sm,
  },
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
