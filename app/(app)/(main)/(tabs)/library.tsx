import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import Animated from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  artworkUrl,
  fetchMusicGenres,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { createPlaylist, addTracksToPlaylist } from '@/src/services/jellyfin/playlists'
import { materializeQueueTracks, materializeQueueTracksFromPages } from '@/src/services/jellyfin/queueMaterialize'
import { buildAlphabetIndex, type AlphabetIndexLetter } from '@/src/domain/alphabetIndex'
import { formatLibrarySyncProgress } from '@/src/domain/librarySync'
import { playlistStub } from '@/src/domain/playlists'
import { useSessionStore } from '@/src/store/session'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { loadAllSongs, loadSongsAfter } from '@/src/storage/libraryDb'
import { PressableScale, settleEntering, useMotionEnabled } from '@/src/theme/motion'
import { AlphabetIndex, ALPHABET_INDEX_LIST_INSET } from '@/src/ui/AlphabetIndex'
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
import { buildTrackActions } from '@/src/ui/trackActions'
import {
  applyLibraryView,
  LIBRARY_FILTERS,
  LIBRARY_SORTS,
  libraryFilterLabel,
  librarySortLabel,
} from '@/src/domain/libraryView'
import { useSettingsStore } from '@/src/store/settings'
import {
  markPlayedItem,
  markUnplayedItem,
} from '@/src/services/jellyfin/playbackReport'
import { toggleFavoriteItem } from '@/src/services/jellyfin/favoriteToggle'
import { SegmentControl } from '@/src/ui/SegmentControl'
import { TRACK_ROW_HEIGHT, TrackRow } from '@/src/ui/TrackRow'
import { colors, motion, radii, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'

type Segment = 'songs' | 'albums' | 'artists' | 'genres' | 'playlists'

const SEGMENTS: readonly Segment[] = ['songs', 'albums', 'artists', 'genres', 'playlists']
/** Stable empty list. Zustand selectors must not return a fresh `[]` each call. */
const EMPTY_LIBRARY_ITEMS: readonly LibraryItem[] = []

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
  const setQueueTracksPreservingPlayback = usePlayerStore(
    (s) => s.setQueueTracksPreservingPlayback,
  )
  const enqueueTracks = usePlayerStore((s) => s.enqueueTracks)
  const playNextTracks = usePlayerStore((s) => s.playNextTracks)
  const [segment, setSegment] = useState<Segment>('songs')
  const [nameOpen, setNameOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [seedTrackId, setSeedTrackId] = useState<string | null>(null)
  const [createFromPicker, setCreateFromPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [genres, setGenres] = useState<readonly LibraryItem[]>([])
  const [genresLoading, setGenresLoading] = useState(false)
  const [genresError, setGenresError] = useState<string | null>(null)
  const songs = useLibraryStore((s) => s.songs)
  const songsCount = useLibraryStore((s) => s.songsCount)
  const songsHasMore = useLibraryStore((s) => s.songsHasMore)
  const loadMoreSongs = useLibraryStore((s) => s.loadMoreSongs)
  const items = useLibraryStore((s) => {
    if (segment === 'songs') return s.songs
    if (segment === 'albums') return s.albums
    if (segment === 'artists') return s.artists
    if (segment === 'playlists') return s.playlists
    return EMPTY_LIBRARY_ITEMS
  })
  const playlists = useLibraryStore((s) => s.playlists)
  const syncing = useLibraryStore((s) => s.syncing)
  const syncProgress = useLibraryStore((s) => s.syncProgress)
  const syncError = useLibraryStore((s) => s.syncError)
  const hydrated = useLibraryStore((s) => s.hydrated)
  const syncLibrary = useLibraryStore((s) => s.syncLibrary)
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists)
  const upsertPlaylist = useLibraryStore((s) => s.upsertPlaylist)
  const patchFavorite = useLibraryStore((s) => s.patchFavorite)
  const patchPlayed = useLibraryStore((s) => s.patchPlayed)
  const librarySort = useSettingsStore((s) => s.librarySort)
  const libraryFilter = useSettingsStore((s) => s.libraryFilter)
  const setLibrarySort = useSettingsStore((s) => s.setLibrarySort)
  const setLibraryFilter = useSettingsStore((s) => s.setLibraryFilter)
  const displayItems = useMemo(
    () =>
      applyLibraryView(
        segment === 'genres' ? genres : items,
        librarySort,
        segment === 'songs' || segment === 'albums' || segment === 'artists'
          ? libraryFilter
          : 'all',
      ),
    [genres, items, libraryFilter, librarySort, segment],
  )
  const playlistCardWidth = Math.min(168, (width - spacing.lg * 2 - spacing.md) / 2)
  const playlistRowHeight =
    playlistCardWidth + spacing.sm + 40 + 18 + spacing.md
  const rowsListRef = useRef<FlatList<LibraryItem>>(null)
  const playlistsListRef = useRef<FlatList<LibraryItem>>(null)
  const songsListRef = useRef<FlashListRef<LibraryItem>>(null)
  const alphabetHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [alphabetVisible, setAlphabetVisible] = useState(false)
  const [songLetterMap, setSongLetterMap] = useState<Readonly<
    Partial<Record<AlphabetIndexLetter, number>>
  >>({})
  const jumpSongsToLetter = useLibraryStore((s) => s.jumpSongsToLetter)
  const songAlphabetLetters = useLibraryStore((s) => s.songAlphabetLetters)
  const refreshSongsWindow = useLibraryStore((s) => s.refreshSongsWindow)
  const alphabetMap = useMemo(() => {
    if (segment === 'songs' && librarySort === 'name' && libraryFilter === 'all') {
      return songLetterMap
    }
    return buildAlphabetIndex(displayItems)
  }, [displayItems, libraryFilter, librarySort, segment, songLetterMap])

  useEffect(() => {
    if (segment !== 'songs' || librarySort !== 'name' || libraryFilter !== 'all') {
      return
    }
    const ac = new AbortController()
    void songAlphabetLetters().then((letters) => {
      if (ac.signal.aborted) return
      const map: Partial<Record<AlphabetIndexLetter, number>> = {}
      for (const letter of letters) {
        if (letter === '#' || (letter >= 'A' && letter <= 'Z')) {
          map[letter as AlphabetIndexLetter] = 0
        }
      }
      setSongLetterMap(map)
    })
    return () => {
      ac.abort()
    }
  }, [libraryFilter, librarySort, segment, songAlphabetLetters, songsCount])

  const clearAlphabetHide = useCallback(() => {
    if (!alphabetHideTimer.current) return
    clearTimeout(alphabetHideTimer.current)
    alphabetHideTimer.current = null
  }, [])

  const revealAlphabet = useCallback(() => {
    clearAlphabetHide()
    setAlphabetVisible(true)
  }, [clearAlphabetHide])

  const hideAlphabetSoon = useCallback(() => {
    clearAlphabetHide()
    alphabetHideTimer.current = setTimeout(() => {
      alphabetHideTimer.current = null
      setAlphabetVisible(false)
    }, 900)
  }, [clearAlphabetHide])

  useEffect(() => {
    clearAlphabetHide()
    setAlphabetVisible(false)
  }, [clearAlphabetHide, segment])

  useEffect(() => () => clearAlphabetHide(), [clearAlphabetHide])

  const alphabetScrollProps = {
    scrollEventThrottle: 16,
    onScrollBeginDrag: revealAlphabet,
    onMomentumScrollBegin: revealAlphabet,
    onScrollEndDrag: hideAlphabetSoon,
    onMomentumScrollEnd: hideAlphabetSoon,
  } as const

  const jumpToAlphabetLetter = useCallback(
    (letter: AlphabetIndexLetter) => {
      if (alphabetMap[letter] === undefined) return
      revealAlphabet()
      hideAlphabetSoon()

      if (segment === 'songs') {
        if (librarySort !== 'name' || libraryFilter !== 'all') {
          const index = alphabetMap[letter]
          if (index === undefined || index < 0) return
          requestAnimationFrame(() => {
            void songsListRef.current?.scrollToIndex({
              index,
              animated: true,
              viewPosition: 0,
            })
          })
          return
        }
        void jumpSongsToLetter(letter)
          .then((index) => {
            if (index == null || index < 0) return
            requestAnimationFrame(() => {
              void songsListRef.current?.scrollToIndex({
                index,
                animated: true,
                viewPosition: 0,
              })
            })
          })
          .catch(() => undefined)
        return
      }

      const index = alphabetMap[letter]
      if (index === undefined || index < 0) return

      // 2-column playlist grid: scrollToIndex + getItemLayout is unreliable.
      if (segment === 'playlists') {
        playlistsListRef.current?.scrollToOffset({
          offset: Math.floor(index / 2) * playlistRowHeight,
          animated: true,
        })
        return
      }

      rowsListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0,
      })
    },
    [
      alphabetMap,
      hideAlphabetSoon,
      jumpSongsToLetter,
      libraryFilter,
      librarySort,
      playlistRowHeight,
      revealAlphabet,
      segment,
    ],
  )

  const refresh = useCallback(() => {
    void syncLibrary('manual')
  }, [syncLibrary])

  useEffect(() => {
    if (!hydrated) void useLibraryStore.getState().hydrate()
  }, [hydrated])

  useEffect(() => {
    if (segment !== 'songs' || Platform.OS === 'web') return
    void refreshSongsWindow()
  }, [libraryFilter, librarySort, refreshSongsWindow, segment])

  useEffect(() => {
    if (segment !== 'genres' || !context || !session) return
    const ac = new AbortController()
    const load = async () => {
      setGenresLoading(true)
      setGenresError(null)
      const result = await fetchMusicGenres(context, session.userId)
      if (ac.signal.aborted) return
      if (!result.ok) {
        setGenresError(result.error.message)
        setGenres([])
      } else {
        setGenres(result.value)
      }
      setGenresLoading(false)
    }
    void load()
    return () => {
      ac.abort()
    }
  }, [segment, context, session])

  const heroArtFor = useCallback(
    (item: LibraryItem) =>
      context
        ? artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'hero')
        : undefined,
    [context],
  )

  const playSongsFromIndex = useCallback(
    (index: number, list: readonly LibraryItem[]) => {
      const seed = list[index]
      if (!seed) return
      if (libraryFilter !== 'all') {
        const tracks = list.map((item) => toQueueTrack(item, heroArtFor(item)))
        playQueue(tracks, Math.max(0, index))
        return
      }
      playQueue([toQueueTrack(seed, heroArtFor(seed))], 0)
      const queueGen = usePlayerStore.getState().queueGen
      const stillThisPlay = () => usePlayerStore.getState().queueGen === queueGen
      const publishView = (items: readonly LibraryItem[]) => {
        if (!stillThisPlay()) return
        const viewed = applyLibraryView(items, librarySort, 'all')
        setQueueTracksPreservingPlayback(
          viewed.map((item) => toQueueTrack(item, heroArtFor(item))),
        )
      }
      if (librarySort !== 'name') {
        if (Platform.OS === 'web') {
          publishView(songs)
          return
        }
        void loadAllSongs().then(publishView)
        return
      }
      if (Platform.OS === 'web') {
        if (songs.length <= 1) return
        const firstSeeded = { published: false }
        void materializeQueueTracks(songs, heroArtFor, {
          onChunk: (tracks) => {
            if (!stillThisPlay()) return
            if (firstSeeded.published) return
            if (!tracks.some((track) => track.id === seed.id)) return
            firstSeeded.published = true
            setQueueTracksPreservingPlayback(tracks)
          },
        }).then((tracks) => {
          if (!stillThisPlay()) return
          setQueueTracksPreservingPlayback(tracks)
        })
        return
      }
      if (songsCount <= 1) return
      const firstSeeded = { published: false }
      void materializeQueueTracksFromPages(
        (cursor, limit) => loadSongsAfter(cursor, limit),
        heroArtFor,
        {
          onChunk: (tracks) => {
            if (!stillThisPlay()) return
            if (firstSeeded.published) return
            if (!tracks.some((track) => track.id === seed.id)) return
            firstSeeded.published = true
            setQueueTracksPreservingPlayback(tracks)
          },
        },
      ).then((tracks) => {
        if (!stillThisPlay()) return
        setQueueTracksPreservingPlayback(tracks)
      })
    },
    [
      heroArtFor,
      libraryFilter,
      librarySort,
      playQueue,
      setQueueTracksPreservingPlayback,
      songs,
      songsCount,
    ],
  )

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
        Alert.alert("Couldn't create playlist", result.error.message)
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
      router.push(`/(app)/(main)/playlist/${result.value}`)
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
        Alert.alert("Couldn't add to playlist", result.error.message)
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

  const onSongLongPress = (item: LibraryItem) => {
    const queueTrack = toQueueTrack(
      item,
      context
        ? artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'hero')
        : undefined,
    )
    presentTrackActions(
      item.name,
      buildTrackActions({
        onPlayNext: () => playNextTracks([queueTrack]),
        onAddToQueue: () => enqueueTracks([queueTrack]),
        onStartRadio: () => {
          void import('@/src/player/startRadio').then(({ startRadioFromItem }) => {
            void startRadioFromItem(item.id, item.artistId)
          })
        },
        onAddToPlaylist: () => {
          if (!requireSession()) return
          setSeedTrackId(item.id)
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
            onLocal: (next) => patchFavorite(item.id, next),
          })
        },
        isPlayed: Boolean(item.isPlayed),
        onTogglePlayed: () => {
          if (!context || !session) {
            Alert.alert('Sign in required', 'Sign in to update play state.')
            return
          }
          const nextPlayed = !item.isPlayed
          patchPlayed(item.id, nextPlayed)
          void (nextPlayed
            ? markPlayedItem(context, {
                itemId: item.id,
                userId: session.userId,
                datePlayed: new Date().toISOString(),
              })
            : markUnplayedItem(context, {
                itemId: item.id,
                userId: session.userId,
              })
          ).then((result) => {
            if (!result.ok) {
              patchPlayed(item.id, Boolean(item.isPlayed))
              Alert.alert("Couldn't update", result.error.message)
            }
          })
        },
      }),
    )
  }

  const openViewMenu = () => {
    presentTrackActions('Library view', [
      ...LIBRARY_SORTS.map((sort) => ({
        text: `${librarySort === sort ? '✓ ' : ''}${librarySortLabel(sort)}`,
        onPress: () => void setLibrarySort(sort),
      })),
      ...LIBRARY_FILTERS.map((filter) => ({
        text: `${libraryFilter === filter ? '✓ ' : ''}${libraryFilterLabel(filter)}`,
        onPress: () => void setLibraryFilter(filter),
      })),
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
        {segment === 'songs' || segment === 'albums' || segment === 'artists' ? (
          <MoreButton label="Sort and filter" onPress={openViewMenu} />
        ) : null}
        {segment === 'playlists' ? (
          <MoreButton
            label="Playlist options"
            onPress={openLibraryMenu}
          />
        ) : null}
      </View>
      <SegmentControl values={SEGMENTS} value={segment} onChange={setSegment} />
      {segment === 'songs' || segment === 'albums' || segment === 'artists' ? (
        <Muted>
          {librarySortLabel(librarySort)}
          {libraryFilter !== 'all' ? ` · ${libraryFilterLabel(libraryFilter)}` : ''}
        </Muted>
      ) : null}
      {syncing && displayItems.length === 0 && songsCount === 0 && segment !== 'genres' ? (
        <LoadingState label={formatLibrarySyncProgress(syncProgress)} />
      ) : null}
      {segment === 'genres' && genresLoading && genres.length === 0 ? (
        <LoadingState label="Loading genres" />
      ) : null}
      {syncError && displayItems.length === 0 && songsCount === 0 && segment !== 'genres' ? (
        <ErrorState message={syncError} onRetry={refresh} />
      ) : null}
      {segment === 'genres' && genresError && genres.length === 0 ? (
        <ErrorState
          message={genresError}
          onRetry={() => {
            setSegment('genres')
            setGenresError(null)
            if (context && session) {
              void fetchMusicGenres(context, session.userId).then((result) => {
                if (!result.ok) setGenresError(result.error.message)
                else setGenres(result.value)
              })
            }
          }}
        />
      ) : null}
      {!syncing &&
      !syncError &&
      displayItems.length === 0 &&
      songsCount === 0 &&
      segment !== 'playlists' &&
      segment !== 'genres' ? (
        <EmptyState
          title="Library empty"
          message="Tap Sync library to pull from your Jellyfin server."
        />
      ) : null}
      {!genresLoading && !genresError && genres.length === 0 && segment === 'genres' ? (
        <EmptyState title="No genres" message="Your server didn't return any music genres." />
      ) : null}
      {!syncing && !syncError && displayItems.length === 0 && segment === 'playlists' ? (
        <View style={styles.emptyPlaylists}>
          <EmptyState
            title="No playlists yet"
            message="Tap ··· above to create one, or long-press a song → Add to playlist."
          />
          <GlassButton label="Sync library" onPress={refresh} />
        </View>
      ) : null}
      {displayItems.length === 0 &&
      songsCount === 0 &&
      !syncing &&
      !syncError &&
      segment !== 'playlists' &&
      segment !== 'genres' ? (
        <GlassButton label="Sync library" onPress={refresh} />
      ) : null}
      {displayItems.length > 0 || (segment === 'songs' && songsCount > 0) ? (
        <Animated.View
          key={segment}
          entering={settleEntering(enabled)}
          style={styles.listWrap}
        >
          {syncError && segment !== 'genres' ? (
            <GlassButton label="Retry sync" onPress={refresh} />
          ) : null}
          {segment === 'playlists' ? (
            <FlatList
              ref={playlistsListRef}
              data={displayItems}
              keyExtractor={(item) => item.id}
              numColumns={2}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              columnWrapperStyle={styles.playlistRow}
              contentContainerStyle={[
                styles.playlistList,
                {
                  paddingBottom: scrollUnderChromePad(insets.bottom),
                  paddingRight: ALPHABET_INDEX_LIST_INSET,
                },
              ]}
              windowSize={7}
              maxToRenderPerBatch={8}
              initialNumToRender={6}
              removeClippedSubviews={Platform.OS !== 'web'}
              {...alphabetScrollProps}
              renderItem={({ item }) => (
                <PlaylistCard
                  item={item}
                  art={artFor(item)}
                  width={playlistCardWidth}
                  onPress={() => router.push(`/(app)/(main)/playlist/${item.id}`)}
                />
              )}
            />
          ) : segment === 'songs' ? (
            <FlashList
              ref={songsListRef}
              data={displayItems}
              keyExtractor={(item) => item.id}
              style={styles.flex}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                ...styles.list,
                paddingBottom: scrollUnderChromePad(insets.bottom),
                paddingRight: ALPHABET_INDEX_LIST_INSET,
              }}
              drawDistance={250}
              {...alphabetScrollProps}
              onEndReached={() => {
                if (songsHasMore) void loadMoreSongs()
              }}
              onEndReachedThreshold={0.4}
              renderItem={({ item, index }) => (
                <TrackRow
                  item={item}
                  artworkUrl={artFor(item)}
                  onPress={() => {
                    playSongsFromIndex(index, displayItems)
                  }}
                  onLongPress={() => onSongLongPress(item)}
                  accessibilityHint="Long press for playlist actions"
                />
              )}
            />
          ) : (
            <FlatList
              ref={rowsListRef}
              data={displayItems}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.list,
                {
                  paddingBottom: scrollUnderChromePad(insets.bottom),
                  paddingRight: ALPHABET_INDEX_LIST_INSET,
                },
              ]}
              windowSize={7}
              maxToRenderPerBatch={8}
              initialNumToRender={6}
              removeClippedSubviews={Platform.OS !== 'web'}
              {...alphabetScrollProps}
              getItemLayout={(_, index) => ({
                length: TRACK_ROW_HEIGHT,
                offset: TRACK_ROW_HEIGHT * index,
                index,
              })}
              onScrollToIndexFailed={(info) => {
                rowsListRef.current?.scrollToOffset({
                  offset: Math.max(0, info.index * TRACK_ROW_HEIGHT),
                  animated: true,
                })
              }}
              renderItem={({ item }) => (
                <TrackRow
                  item={item}
                  artworkUrl={artFor(item)}
                  onPress={() => {
                    if (segment === 'albums') router.push(`/(app)/(main)/album/${item.id}`)
                    if (segment === 'artists') router.push(`/(app)/(main)/artist/${item.id}`)
                    if (segment === 'genres') {
                      router.push({
                        pathname: '/(app)/(main)/genre/[id]',
                        params: { id: item.id, name: item.name },
                      })
                    }
                  }}
                />
              )}
            />
          )}
          {displayItems.length > 0 ? (
            <AlphabetIndex
              indexMap={alphabetMap}
              onSelectLetter={jumpToAlphabetLetter}
              visible={alphabetVisible}
              safeBottom={insets.bottom}
            />
          ) : null}
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
    position: 'relative',
  },
  flex: {
    flex: 1,
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
