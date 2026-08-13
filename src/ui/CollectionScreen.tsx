import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Platform, StyleSheet, Text, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatCollectionDuration } from '@/src/domain/format'
import { normalizePlaylistName, playlistStub } from '@/src/domain/playlists'
import { backfillSongArtists } from '@/src/domain/songArtists'
import {
  artworkUrl,
  fetchAlbumsByArtist,
  fetchChildren,
  fetchItem,
  fetchPlaylistTracks,
  fetchSongsForArtist,
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
import { downloadTracks } from '@/src/offline/downloader'
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
  EmptyState,
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
import { buildTrackActions } from '@/src/ui/trackActions'
import { toggleFavoriteItem } from '@/src/services/jellyfin/favoriteToggle'
import { SegmentControl } from '@/src/ui/SegmentControl'
import { TrackRow } from '@/src/ui/TrackRow'
import { colors, motion, radii, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'

type ArtistSegment = 'albums' | 'songs'
const ARTIST_SEGMENTS: readonly ArtistSegment[] = ['albums', 'songs']

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
  albumCount,
  durationMs,
  heroArt,
  downloading,
  shuffle,
  isActiveQueue,
  onPlay,
  onShuffle,
  onDownload,
}: {
  readonly title: string
  readonly overview?: string
  readonly trackCount: number
  readonly albumCount?: number
  readonly durationMs: number
  readonly heroArt?: string
  readonly downloading: boolean
  readonly shuffle: boolean
  readonly isActiveQueue: boolean
  readonly onPlay: () => void
  readonly onShuffle: () => void
  readonly onDownload: () => void
}) => {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const meta = [
    durationMs > 0 ? formatCollectionDuration(durationMs) : undefined,
    albumCount !== undefined
      ? `${albumCount} album${albumCount === 1 ? '' : 's'}`
      : undefined,
    `${trackCount} track${trackCount === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const showPause = isActiveQueue && isPlaying

  return (
    <View style={styles.hero}>
      {heroArt ? (
        <Image
          source={{ uri: heroArt }}
          style={styles.heroArt}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
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
  const playNextTracks = usePlayerStore((s) => s.playNextTracks)
  const togglePlaying = usePlayerStore((s) => s.togglePlaying)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const queueSource = usePlayerStore((s) => s.queueSource)
  const setOfflineIndex = useSettingsStore((s) => s.setOfflineIndex)
  const [collection, setCollection] = useState<LibraryItem | null>(null)
  const [tracks, setTracks] = useState<readonly LibraryItem[]>([])
  const [albums, setAlbums] = useState<readonly LibraryItem[]>([])
  const [artistSegment, setArtistSegment] = useState<ArtistSegment>('albums')
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
    else router.replace('/(app)/(main)/(tabs)/library')
  }, [router])

  const load = useCallback(async (opts?: { readonly silent?: boolean }) => {
    if (!context || !session || !id) return
    loadSeq.current += 1
    const seq = loadSeq.current
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }

    if (kind === 'artist') {
      const [meta, albumResult, songResult] = await Promise.all([
        fetchItem(context, session.userId, id),
        fetchAlbumsByArtist(context, session.userId, id),
        fetchSongsForArtist(context, session.userId, id),
      ])
      if (seq !== loadSeq.current) return
      if (!opts?.silent) setLoading(false)
      if (!songResult.ok) {
        if (!opts?.silent) setError(songResult.error.message)
        return
      }
      setAlbums(albumResult.ok ? albumResult.value : [])
      setTracks(backfillSongArtists(songResult.value, albumResult.ok ? albumResult.value : []))
      setCollection(meta.ok ? meta.value : null)
      return
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
    setAlbums([])
    setTracks(
      backfillSongArtists(
        children.value,
        kind === 'album' && meta.ok ? [meta.value] : [],
      ),
    )
    setCollection(meta.ok ? meta.value : null)
  }, [context, session, id, kind])

  useEffect(() => {
    void load()
  }, [load])

  const buildQueueTracks = useCallback(
    () =>
      tracks.map((track) =>
        toQueueTrack(
          track,
          context
            ? artworkUrl(context, track.imageItemId ?? track.id, track.imageTag, 'hero')
            : undefined,
        ),
      ),
    [tracks, context],
  )

  const source = useMemo(
    () => (id ? ({ kind, id } as const) : null),
    [kind, id],
  )
  const isActiveQueue =
    !!source &&
    queueSource?.kind === source.kind &&
    queueSource.id === source.id

  const playAll = useCallback(() => {
    const queueTracks = buildQueueTracks()
    if (queueTracks.length === 0) return
    if (isActiveQueue) {
      togglePlaying()
      return
    }
    const startIndex = shuffle
      ? Math.floor(Math.random() * queueTracks.length)
      : 0
    playQueue(queueTracks, startIndex, source)
  }, [buildQueueTracks, isActiveQueue, togglePlaying, playQueue, source, shuffle])

  const shuffleCollection = useCallback(() => {
    if (isActiveQueue) {
      toggleShuffle()
      return
    }
    const queueTracks = buildQueueTracks()
    if (queueTracks.length === 0) return
    if (!usePlayerStore.getState().shuffle) {
      usePlayerStore.getState().toggleShuffle()
    }
    const startIndex = Math.floor(Math.random() * queueTracks.length)
    playQueue(queueTracks, startIndex, source)
  }, [buildQueueTracks, isActiveQueue, toggleShuffle, playQueue, source])

  const downloadAll = useCallback(() => {
    if (!context || !session || downloading) return
    if (Platform.OS === 'web') return
    const queueTracks = buildQueueTracks()
    setDownloading(true)
    void downloadTracks(context, session.userId, queueTracks, 'user')
      .then(async (result) => {
        if (result.ok) await setOfflineIndex(result.value)
      })
      .finally(() => {
        setDownloading(false)
      })
  }, [context, session, downloading, buildQueueTracks, setOfflineIndex])

  const requireSession = useCallback((): boolean => {
    if (context && session) return true
    Alert.alert('Sign in required', 'Sign in to manage playlists.')
    return false
  }, [context, session])

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

  const removeTrack = useCallback(
    async (entryId: string) => {
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
    },
    [context, session, id, mutating, load, refreshPlaylists],
  )

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
      router.push(`/(app)/(main)/playlist/${result.value}`)
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

  const heroArt =
    context && collection
      ? artworkUrl(
          context,
          collection.imageItemId ?? collection.id,
          collection.imageTag,
          'hero',
        )
      : undefined

  const onTrackLongPress = useCallback(
    (item: LibraryItem, index: number) => {
      const queueTrack = buildQueueTracks()[index]
      if (!queueTrack) return
      const extra =
        kind === 'playlist' && item.playlistEntryId
          ? ([
              {
                text: 'Remove from playlist',
                style: 'destructive' as const,
                onPress: () => {
                  void removeTrack(item.playlistEntryId!)
                },
              },
            ] as const)
          : undefined
      presentTrackActions(
        item.name,
        buildTrackActions({
          onPlayNext: () => playNextTracks([queueTrack]),
          onAddToQueue: () => enqueueTracks([queueTrack]),
          onAddToPlaylist: () => {
            if (!requireSession()) return
            setPendingTrackId(item.id)
            setCreateFromPicker(false)
            setPickerOpen(true)
          },
          isFavorite: Boolean(item.isFavorite),
          onToggleFavorite: () => {
            if (!context || !session) {
              Alert.alert('Sign in required', 'Sign in to manage favorites.')
              return
            }
            void toggleFavoriteItem({
              context,
              userId: session.userId,
              itemId: item.id,
              currentlyFavorite: Boolean(item.isFavorite),
              onLocal: (next) => {
                setTracks((prev) =>
                  prev.map((track) =>
                    track.id === item.id ? { ...track, isFavorite: next } : track,
                  ),
                )
              },
            })
          },
          extra,
        }),
      )
    },
    [
      buildQueueTracks,
      kind,
      playNextTracks,
      enqueueTracks,
      context,
      session,
      removeTrack,
      requireSession,
    ],
  )

  const numbered = kind === 'album'
  const showAlbums = kind === 'artist' && artistSegment === 'albums'
  const listItems = showAlbums ? albums : tracks
  const totalDurationMs =
    collection && collection.durationMs > 0
      ? collection.durationMs
      : tracks.reduce((sum, track) => sum + track.durationMs, 0)
  const artists = collection?.artists.filter(Boolean).join(', ')
  const overview =
    collection?.overview ||
    (kind === 'album' ? artists : undefined) ||
    undefined

  const listHeader = useMemo(
    () => (
      <View>
        <CollectionHero
          title={collection?.name ?? kindLabel(kind)}
          overview={overview}
          trackCount={tracks.length}
          albumCount={kind === 'artist' ? albums.length : undefined}
          durationMs={totalDurationMs}
          heroArt={heroArt}
          downloading={downloading}
          shuffle={shuffle}
          isActiveQueue={isActiveQueue}
          onPlay={playAll}
          onShuffle={shuffleCollection}
          onDownload={downloadAll}
        />
        {kind === 'artist' ? (
          <SegmentControl
            values={ARTIST_SEGMENTS}
            value={artistSegment}
            onChange={setArtistSegment}
          />
        ) : null}
      </View>
    ),
    [
      collection?.name,
      kind,
      overview,
      tracks.length,
      albums.length,
      totalDurationMs,
      heroArt,
      downloading,
      shuffle,
      isActiveQueue,
      playAll,
      shuffleCollection,
      downloadAll,
      artistSegment,
    ],
  )

  const renderTrack = useCallback(
    ({ item, index }: { item: LibraryItem; index: number }) => (
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
          if (showAlbums) {
            router.push(`/(app)/(main)/album/${item.id}`)
            return
          }
          playQueue(buildQueueTracks(), index, source)
        }}
        onLongPress={
          showAlbums ? undefined : () => onTrackLongPress(item, index)
        }
        accessibilityHint={showAlbums ? undefined : 'Long press for track actions'}
      />
    ),
    [
      numbered,
      context,
      showAlbums,
      router,
      playQueue,
      buildQueueTracks,
      source,
      onTrackLongPress,
    ],
  )

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
          <FlashList
            data={listItems}
            keyExtractor={(item) => item.playlistEntryId ?? item.id}
            style={styles.flexList}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: scrollUnderChromePad(insets.bottom),
            }}
            drawDistance={250}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <View style={styles.empty}>
                {showAlbums ? (
                  <EmptyState
                    title="No albums"
                    message="This artist doesn’t have any albums on your server."
                  />
                ) : (
                  <Muted>No tracks in this {kind}.</Muted>
                )}
              </View>
            }
            renderItem={renderTrack}
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
  flexList: {
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
