import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, FlatList, Platform, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatCollectionDuration } from '@/src/domain/format'
import { normalizePlaylistName, playlistStub } from '@/src/domain/playlists'
import {
  artworkUrl,
  fetchChildren,
  fetchItem,
  fetchPlaylistTracks,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  removeTracksFromPlaylist,
  renamePlaylist,
} from '@/src/services/jellyfin/playlists'
import { downloadTrack } from '@/src/offline/downloader'
import { useLibraryStore } from '@/src/store/library'
import { useSessionStore } from '@/src/store/session'
import { usePlayerStore } from '@/src/store/player'
import { useSettingsStore } from '@/src/store/settings'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { PressableScale } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { BackButton, MoreButton } from '@/src/ui/NavChrome'
import { EdgeBackGesture } from '@/src/ui/EdgeBackGesture'
import {
  ErrorState,
  LoadingState,
  Muted,
  Screen,
} from '@/src/ui/primitives'
import {
  PlaylistNameModal,
  PlaylistPickerModal,
  presentTrackActions,
} from '@/src/ui/PlaylistActions'
import { TrackRow } from '@/src/ui/TrackRow'
import { colors, motion, radii, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'

const kindLabel = (kind: 'album' | 'artist' | 'playlist'): string => {
  if (kind === 'album') return 'Album'
  if (kind === 'artist') return 'Artist'
  return 'Playlist'
}

const CircleAction = ({
  label,
  icon,
  onPress,
  primary = false,
  active = false,
  size = 44,
  iconSize = 22,
}: {
  readonly label: string
  readonly icon: string
  readonly onPress: () => void
  readonly primary?: boolean
  readonly active?: boolean
  readonly size?: number
  readonly iconSize?: number
}) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={active ? { selected: true } : undefined}
    scaleTo={motion.scale.button}
    onPress={onPress}
    hitSlop={8}
    style={{ width: size, height: size }}
  >
    {primary ? (
      <AccentGradient
        style={[styles.circlePrimary, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Icon name={icon} tintColor={colors.onAccent} size={iconSize} />
      </AccentGradient>
    ) : (
      <View style={[styles.circlePlain, { width: size, height: size }]}>
        <Icon
          name={icon}
          tintColor={active ? colors.accent : colors.text}
          size={iconSize}
        />
      </View>
    )}
  </PressableScale>
)

const CollectionHero = ({
  title,
  overview,
  trackCount,
  durationMs,
  heroArt,
  downloading,
  shuffle,
  isActiveQueue,
  isPlaying,
  onPlay,
  onShuffle,
  onDownload,
}: {
  readonly title: string
  readonly overview?: string
  readonly trackCount: number
  readonly durationMs: number
  readonly heroArt?: string
  readonly downloading: boolean
  readonly shuffle: boolean
  readonly isActiveQueue: boolean
  readonly isPlaying: boolean
  readonly onPlay: () => void
  readonly onShuffle: () => void
  readonly onDownload: () => void
}) => {
  const meta = [
    durationMs > 0 ? formatCollectionDuration(durationMs) : undefined,
    `${trackCount} track${trackCount === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const showPause = isActiveQueue && isPlaying

  return (
    <View style={styles.hero}>
      {heroArt ? (
        <Image source={{ uri: heroArt }} style={styles.heroArt} contentFit="cover" />
      ) : (
        <View style={[styles.heroArt, styles.heroFallback]} />
      )}
      <View style={styles.heroMeta}>
        <Text style={styles.heroTitle} numberOfLines={3}>
          {title}
        </Text>
        {overview ? (
          <Text style={styles.heroOverview} numberOfLines={4}>
            {overview}
          </Text>
        ) : null}
        <Muted>{meta}</Muted>
        <View style={styles.heroActions}>
          <CircleAction
            label={downloading ? 'Saving…' : 'Download'}
            icon="arrow.down.circle.fill"
            onPress={onDownload}
            size={44}
            iconSize={30}
          />
          <View style={styles.heroActionsRight}>
            <CircleAction
              label={shuffle ? 'Shuffle on' : 'Shuffle off'}
              icon="shuffle"
              active={shuffle}
              onPress={onShuffle}
              size={44}
              iconSize={22}
            />
            <CircleAction
              label={showPause ? 'Pause' : 'Play'}
              icon={showPause ? 'pause.fill' : 'play.fill'}
              primary
              onPress={onPlay}
              size={48}
              iconSize={22}
            />
          </View>
        </View>
      </View>
    </View>
  )
}

export const CollectionScreen = ({
  kind,
}: {
  readonly kind: 'album' | 'artist' | 'playlist'
}) => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string | string[] }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const playlists = useLibraryStore((s) => s.playlists)
  const upsertPlaylist = useLibraryStore((s) => s.upsertPlaylist)
  const removePlaylistFromCache = useLibraryStore((s) => s.removePlaylist)
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const enqueueTracks = usePlayerStore((s) => s.enqueueTracks)
  const togglePlaying = usePlayerStore((s) => s.togglePlaying)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const queueSource = usePlayerStore((s) => s.queueSource)
  const setOfflineIndex = useSettingsStore((s) => s.setOfflineIndex)
  const [collection, setCollection] = useState<LibraryItem | null>(null)
  const [tracks, setTracks] = useState<readonly LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null)
  const [createFromPicker, setCreateFromPicker] = useState(false)
  const loadSeq = useRef(0)

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/library')
  }, [router])

  const load = useCallback(async (opts?: { readonly silent?: boolean }) => {
    if (!context || !session || !id) return
    loadSeq.current += 1
    const seq = loadSeq.current
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    const [meta, children] = await Promise.all([
      fetchItem(context, session.userId, id),
      kind === 'playlist'
        ? fetchPlaylistTracks(context, session.userId, id)
        : fetchChildren(context, session.userId, id),
    ])
    if (seq !== loadSeq.current) return
    if (!opts?.silent) setLoading(false)
    if (!children.ok) {
      if (!opts?.silent) setError(children.error.message)
      else Alert.alert('Couldn’t refresh playlist', children.error.message)
      return
    }
    setTracks(children.value)
    setCollection(meta.ok ? meta.value : null)
  }, [context, session, id, kind])

  useEffect(() => {
    void load()
  }, [load])

  const requireSession = (): boolean => {
    if (context && session) return true
    Alert.alert('Sign in required', 'Sign in to manage playlists.')
    return false
  }

  const runRename = async (name: string) => {
    if (!context || !session || !id || mutating) return
    setMutating(true)
    try {
      const result = await renamePlaylist(context, id, name)
      if (!result.ok) {
        Alert.alert('Couldn’t rename playlist', result.error.message)
        return
      }
      const nextName = normalizePlaylistName(name)
      setRenameOpen(false)
      setCollection((prev) => (prev ? { ...prev, name: nextName } : prev))
      if (collection) {
        await upsertPlaylist({ ...collection, name: nextName })
      } else {
        await upsertPlaylist({
          ...playlistStub(id, nextName, tracks.length),
          type: 'Playlist',
          artists: [],
          durationMs: 0,
        })
      }
      await refreshPlaylists()
    } finally {
      setMutating(false)
    }
  }

  const runDelete = () => {
    if (!requireSession() || !context || !session || !id || mutating) return
    setMutating(true)
    Alert.alert('Delete playlist?', 'This removes the playlist from Jellyfin.', [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => setMutating(false),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const result = await deletePlaylist(context, id)
              if (!result.ok) {
                Alert.alert('Couldn’t delete playlist', result.error.message)
                return
              }
              await removePlaylistFromCache(id)
              await refreshPlaylists()
              goBack()
            } finally {
              setMutating(false)
            }
          })()
        },
      },
    ])
  }

  const openPlaylistMenu = () => {
    if (kind !== 'playlist' || mutating) return
    presentTrackActions('Playlist', [
      { text: 'Rename', onPress: () => setRenameOpen(true) },
      { text: 'Delete', style: 'destructive', onPress: runDelete },
    ])
  }

  const removeTrack = async (entryId: string) => {
    if (!context || !session || !id || mutating) return
    setMutating(true)
    try {
      const result = await removeTracksFromPlaylist(context, id, [entryId])
      if (!result.ok) {
        Alert.alert('Couldn’t remove track', result.error.message)
        return
      }
      setTracks((prev) => prev.filter((track) => track.playlistEntryId !== entryId))
      await load({ silent: true })
      await refreshPlaylists()
    } finally {
      setMutating(false)
    }
  }

  const addPendingToPlaylist = async (playlistId: string) => {
    if (!context || !session || !pendingTrackId || mutating) return
    setMutating(true)
    try {
      const result = await addTracksToPlaylist(
        context,
        session.userId,
        playlistId,
        [pendingTrackId],
      )
      if (!result.ok) {
        Alert.alert('Couldn’t add to playlist', result.error.message)
        return
      }
      setPickerOpen(false)
      setCreateFromPicker(false)
      setPendingTrackId(null)
      await refreshPlaylists()
      if (kind === 'playlist' && playlistId === id) await load({ silent: true })
    } finally {
      setMutating(false)
    }
  }

  const createWithPending = async (name: string) => {
    if (!context || !session || !pendingTrackId || mutating) return
    setMutating(true)
    try {
      const result = await createPlaylist(context, session.userId, name, [pendingTrackId])
      if (!result.ok) {
        Alert.alert('Couldn’t create playlist', result.error.message)
        return
      }
      await upsertPlaylist({
        ...playlistStub(result.value, name, 1),
        type: 'Playlist',
        artists: [],
        durationMs: 0,
      })
      setCreateOpen(false)
      setCreateFromPicker(false)
      setPendingTrackId(null)
      await refreshPlaylists()
      router.push(`/(app)/playlist/${result.value}`)
    } finally {
      setMutating(false)
    }
  }

  const cancelCreate = () => {
    if (mutating) return
    setCreateOpen(false)
    if (createFromPicker) {
      setCreateFromPicker(false)
      setPickerOpen(true)
      return
    }
    setPendingTrackId(null)
  }

  if (loading) {
    return (
      <EdgeBackGesture>
        <Screen padBottom={false}>
          <View style={styles.topBar}>
            <BackButton onPress={goBack} />
          </View>
          <LoadingState />
        </Screen>
      </EdgeBackGesture>
    )
  }
  if (error) {
    return (
      <EdgeBackGesture>
        <Screen padBottom={false}>
          <View style={styles.topBar}>
            <BackButton onPress={goBack} />
          </View>
          <ErrorState message={error} onRetry={() => void load()} />
        </Screen>
      </EdgeBackGesture>
    )
  }

  const queueTracks = tracks.map((track) =>
    toQueueTrack(
      track,
      context
        ? artworkUrl(context, track.imageItemId ?? track.id, track.imageTag, 'hero')
        : undefined,
    ),
  )

  const heroArt =
    context && collection
      ? artworkUrl(
          context,
          collection.imageItemId ?? collection.id,
          collection.imageTag,
          'hero',
        )
      : undefined

  const source = id ? ({ kind, id } as const) : null
  const isActiveQueue =
    !!source &&
    queueSource?.kind === source.kind &&
    queueSource.id === source.id

  const playAll = () => {
    if (queueTracks.length === 0) return
    if (isActiveQueue) {
      togglePlaying()
      return
    }
    playQueue(queueTracks, 0, source)
  }

  const downloadAll = () => {
    if (!context || !session || downloading) return
    if (Platform.OS === 'web') return
    setDownloading(true)
    void Promise.all(
      queueTracks.map((track) => downloadTrack(context, session.userId, track, 'user')),
    )
      .then(async (results) => {
        const last = results.find((result) => result.ok)
        if (last?.ok) await setOfflineIndex(last.value)
      })
      .finally(() => {
        setDownloading(false)
      })
  }

  const onTrackLongPress = (item: LibraryItem, index: number) => {
    const queueTrack = queueTracks[index]
    if (!queueTrack) return
    const addAction = {
      text: 'Add to playlist…',
      onPress: () => {
        if (!requireSession()) return
        setPendingTrackId(item.id)
        setCreateFromPicker(false)
        setPickerOpen(true)
      },
    }
    if (kind === 'playlist') {
      const entryId = item.playlistEntryId
      presentTrackActions(item.name, [
        { text: 'Add to queue', onPress: () => enqueueTracks([queueTrack]) },
        addAction,
        ...(entryId
          ? ([
              {
                text: 'Remove from playlist',
                style: 'destructive' as const,
                onPress: () => {
                  void removeTrack(entryId)
                },
              },
            ] as const)
          : []),
      ])
      return
    }
    presentTrackActions(item.name, [
      { text: 'Add to queue', onPress: () => enqueueTracks([queueTrack]) },
      addAction,
    ])
  }

  const numbered = kind === 'album'
  const totalDurationMs =
    collection && collection.durationMs > 0
      ? collection.durationMs
      : tracks.reduce((sum, track) => sum + track.durationMs, 0)
  const artists = collection?.artists.filter(Boolean).join(', ')
  const overview =
    collection?.overview ||
    (kind === 'album' ? artists : undefined) ||
    undefined

  return (
    <EdgeBackGesture>
      <Screen padBottom={false}>
        <View style={styles.body}>
          <View style={styles.topBar}>
            <BackButton onPress={goBack} />
            {kind === 'playlist' ? (
              <MoreButton label="Playlist options" onPress={openPlaylistMenu} />
            ) : null}
          </View>
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.playlistEntryId ?? item.id}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: scrollUnderChromePad(insets.bottom),
              gap: spacing.xs,
            }}
            windowSize={7}
            maxToRenderPerBatch={8}
            initialNumToRender={8}
            removeClippedSubviews={Platform.OS !== 'web'}
            ListHeaderComponent={
              <CollectionHero
                title={collection?.name ?? kindLabel(kind)}
                overview={overview}
                trackCount={tracks.length}
                durationMs={totalDurationMs}
                heroArt={heroArt}
                downloading={downloading}
                shuffle={shuffle}
                isActiveQueue={isActiveQueue}
                isPlaying={isPlaying}
                onPlay={playAll}
                onShuffle={toggleShuffle}
                onDownload={downloadAll}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Muted>No tracks in this {kind}.</Muted>
              </View>
            }
            renderItem={({ item, index }) => (
              <TrackRow
                item={item}
                index={numbered ? index : undefined}
                artworkUrl={
                  numbered || !context
                    ? undefined
                    : artworkUrl(
                        context,
                        item.imageItemId ?? item.id,
                        item.imageTag,
                        'thumb',
                      )
                }
                onPress={() => {
                  playQueue(queueTracks, index, source)
                }}
                onLongPress={() => onTrackLongPress(item, index)}
                accessibilityHint="Long press for track actions"
              />
            )}
          />
        </View>
        <PlaylistNameModal
          visible={renameOpen}
          title="Rename playlist"
          initialName={collection?.name ?? ''}
          busy={mutating}
          onCancel={() => {
            if (mutating) return
            setRenameOpen(false)
          }}
          onSubmit={(name) => {
            void runRename(name)
          }}
        />
        <PlaylistNameModal
          visible={createOpen}
          title="New playlist"
          busy={mutating}
          onCancel={cancelCreate}
          onSubmit={(name) => {
            void createWithPending(name)
          }}
        />
        <PlaylistPickerModal
          visible={pickerOpen}
          playlists={playlists}
          busy={mutating}
          onCancel={() => {
            if (mutating) return
            setPickerOpen(false)
            setCreateFromPicker(false)
            setPendingTrackId(null)
          }}
          onPick={(playlistId) => {
            void addPendingToPlaylist(playlistId)
          }}
          onCreateNew={() => {
            setCreateFromPicker(true)
            setPickerOpen(false)
            setCreateOpen(true)
          }}
        />
      </Screen>
    </EdgeBackGesture>
  )
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingTop: spacing.sm,
    alignSelf: 'stretch',
  },
  heroMeta: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  heroTitle: {
    ...typography.title,
    fontSize: 28,
    color: colors.text,
    textAlign: 'left',
  },
  heroOverview: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'left',
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    minHeight: 48,
    width: '100%',
  },
  heroActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  circlePlain: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePrimary: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroArt: {
    width: 220,
    height: 220,
    borderRadius: radii.lg,
    backgroundColor: colors.elevated,
  },
  heroFallback: {
    backgroundColor: colors.elevated,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
})
