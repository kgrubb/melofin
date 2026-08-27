import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { browseTileColor, hexToRgba, pairItems } from '@/src/domain/browseTile'
import {
  BROWSE_GENRES_DISPLAY_LIMIT,
  BROWSE_GENRES_PROBE_LIMIT,
  genreTileCovers,
  mergeBrowseGenresForDisplay,
  sampleBrowseGenresStable,
  type BrowseGenre,
} from '@/src/domain/browseGenres'
import {
  loadPersistedBrowseGenres,
  persistBrowseGenres,
} from '@/src/store/browseGenres'
import {
  BROWSE_GENRES_CACHE_VERSION,
  shouldRefreshBrowseGenres,
} from '@/src/domain/browseGenresCache'
import { assembleExplorePlaylists } from '@/src/domain/explorePlaylists'
import { uniqueCollageItems } from '@/src/domain/collageArt'
import { uniqueAlbumsFromTracks } from '@/src/domain/genreAlbums'
import { displayHomeMixCard, titleCaseGenreLabel } from '@/src/domain/homeFeed'
import { homeMixCopyFromT } from '@/src/i18n/homeMixCopy'
import { playlistStub } from '@/src/domain/playlists'
import {
  parseSearchRecents,
  prefixMatchRecents,
  removeSearchRecent,
  searchRecentsPath,
  upsertSearchRecent,
} from '@/src/domain/searchRecents'
import {
  flattenSearchSections,
  groupedSearchCount,
  groupSearchResults,
  SEARCH_FILTERS,
  searchSections,
  type SearchFilter,
  type SearchListRow,
} from '@/src/domain/searchResults'
import {
  artworkUrl,
  fetchBrowseGenres,
  searchLibrary,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { addTracksToPlaylist, createPlaylist } from '@/src/services/jellyfin/playlists'
import { toggleFavoriteItem } from '@/src/services/jellyfin/favoriteToggle'
import { readJsonFile, writeJsonFile } from '@/src/storage/jsonFile'
import {
  loadPersistedHomeMixes,
  useHomeMixesStore,
  type CachedHomeMix,
} from '@/src/store/homeMixes'
import { useLibraryStore } from '@/src/store/library'
import { useSessionStore } from '@/src/store/session'
import { usePlayerStore } from '@/src/store/player'
import { PressableScale } from '@/src/theme/motion'
import {
  ErrorState,
  Field,
  Screen,
  Title,
} from '@/src/ui/primitives'
import {
  PlaylistNameModal,
  PlaylistPickerModal,
  presentTrackActions,
} from '@/src/ui/PlaylistActions'
import { buildTrackActions } from '@/src/ui/trackActions'
import { Artwork } from '@/src/ui/Artwork'
import { Icon } from '@/src/ui/Icon'
import { MixCollage } from '@/src/ui/MixCollage'
import { SegmentControl } from '@/src/ui/SegmentControl'
import { TrackRow } from '@/src/ui/TrackRow'
import { colors, motion, radii, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'
const MIX_THUMB = 52
const SEARCH_DEBOUNCE_MS = 300
const LIST_SCROLL = { disabled: true } as const

const typeLabel = (type: string, label: TFunction): string => {
  if (type === 'Audio') return label('track.song')
  if (type === 'MusicAlbum') return label('track.album')
  if (type === 'MusicArtist') return label('track.artist')
  if (type === 'Playlist') return label('track.playlist')
  return type
}

type GenreTileData = {
  readonly id: string
  readonly name: string
  readonly label: string
  readonly fill: string
  readonly arts: readonly (string | undefined)[]
}

type BrowseRow =
  | { readonly kind: 'heading'; readonly id: string; readonly title: string }
  | {
      readonly kind: 'genrePair'
      readonly id: string
      readonly left: GenreTileData
      readonly right?: GenreTileData
    }
  | {
      readonly kind: 'mix'
      readonly mix: CachedHomeMix
      readonly arts: readonly (string | undefined)[]
    }
  | { readonly kind: 'playlist'; readonly playlist: LibraryItem; readonly art?: string }

const GENRE_ART_BLEED = 1
const GENRE_ART_FADE = 0.34
const GENRE_ART_FADE_HOLD = 3

const GenreTile = memo(function GenreTile({
  tile,
  width,
  height,
  onPress,
}: {
  readonly tile: GenreTileData
  readonly width: number
  readonly height: number
  readonly onPress: (tile: GenreTileData) => void
}) {
  const artSize = height + GENRE_ART_BLEED * 2
  const artLeft = width - height - GENRE_ART_BLEED
  const fadeWidth = height * GENRE_ART_FADE
  const fadeStop = `${Math.round(GENRE_ART_FADE * 100)}%`
  const fadeOpaque = hexToRgba(tile.fill, 1)
  const fadeClear = hexToRgba(tile.fill, 0)
  const collage = (
    <MixCollage arts={tile.arts} size={artSize} radius={0} recyclingKey={tile.id} plate={false} />
  )
  const artLayer =
    Platform.OS === 'web'
      ? createElement(
          'div',
          {
            style: {
              position: 'absolute',
              top: -GENRE_ART_BLEED,
              right: -GENRE_ART_BLEED,
              width: artSize,
              height: artSize,
              overflow: 'hidden',
              isolation: 'isolate',
              contain: 'paint',
              WebkitMaskImage: `linear-gradient(to right, transparent, #000 ${fadeStop})`,
              maskImage: `linear-gradient(to right, transparent, #000 ${fadeStop})`,
            },
          },
          collage,
        )
      : (
          <View style={[styles.genreArt, { width: artSize, height: artSize }]}>{collage}</View>
        )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      onPress={() => onPress(tile)}
      style={[styles.genreCard, { width, height, backgroundColor: tile.fill }]}
    >
      {artLayer}
      {Platform.OS === 'web' ? null : (
        <LinearGradient
          pointerEvents="none"
          colors={[fadeOpaque, fadeOpaque, fadeClear]}
          locations={[0, GENRE_ART_FADE_HOLD / (fadeWidth + GENRE_ART_FADE_HOLD), 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[
            styles.genreCardFade,
            {
              left: artLeft - GENRE_ART_FADE_HOLD,
              width: fadeWidth + GENRE_ART_FADE_HOLD,
            },
          ]}
        />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
        locations={[0.42, 1]}
        style={styles.genreScrim}
      />
      <View pointerEvents="none" style={[styles.genreLabelWrap, { width: width - height * 0.35 }]}>
        <Text style={styles.genreLabel} numberOfLines={2}>
          {tile.label}
        </Text>
      </View>
    </Pressable>
  )
})

const RecentRow = ({
  entry,
  onOpen,
  onRemove,
}: {
  readonly entry: string
  readonly onOpen: (term: string) => void
  readonly onRemove?: (term: string) => void
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.recentRow}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={entry}
        onPress={() => onOpen(entry)}
        style={styles.recentHit}
        scaleTo={motion.scale.button}
      >
        <Icon name="clock" tintColor={colors.textSecondary} size={18} />
        <Text style={styles.recentTitle} numberOfLines={1}>
          {entry}
        </Text>
      </PressableScale>
      {onRemove ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('search.removeRecent', { entry })}
          hitSlop={8}
          onPress={() => onRemove(entry)}
          style={styles.recentRemove}
        >
          <Icon name="xmark" tintColor={colors.textSecondary} size={16} />
        </PressableScale>
      ) : null}
    </View>
  )
}

export default function SearchScreen() {
  const { t } = useTranslation()
  const mixCopy = useMemo(() => homeMixCopyFromT(t), [t])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const fieldRef = useRef<TextInput>(null)
  const browseAccountRef = useRef<string | null>(null)
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const playlists = useLibraryStore((s) => s.playlists)
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists)
  const upsertPlaylist = useLibraryStore((s) => s.upsertPlaylist)
  const mixById = useHomeMixesStore((s) => s.byId)
  const exploreRows = useMemo(
    () => assembleExplorePlaylists(Object.values(mixById), playlists),
    [mixById, playlists],
  )
  const playQueue = usePlayerStore((s) => s.playQueue)
  const enqueueTracks = usePlayerStore((s) => s.enqueueTracks)
  const playNextTracks = usePlayerStore((s) => s.playNextTracks)
  const [term, setTerm] = useState('')
  const [focused, setFocused] = useState(false)
  const [settledTerm, setSettledTerm] = useState('')
  const [results, setResults] = useState<readonly LibraryItem[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [recents, setRecents] = useState<readonly string[]>([])
  const [browseGenres, setBrowseGenres] = useState<readonly BrowseGenre[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [saveMix, setSaveMix] = useState<CachedHomeMix | null>(null)
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null)
  const [createFromPicker, setCreateFromPicker] = useState(false)
  const [busy, setBusy] = useState(false)

  const trimmed = term.trim()
  const browsing = trimmed.length === 0
  const serverUrl = session?.serverUrl
  const userId = session?.userId

  useEffect(() => {
    if (!serverUrl || !userId) {
      setRecents([])
      return
    }
    const controller = new AbortController()
    setRecents([])
    void readJsonFile(searchRecentsPath(serverUrl, userId)).then((result) => {
      if (controller.signal.aborted) return
      setRecents(parseSearchRecents(result.ok ? result.value : null))
    })
    return () => {
      controller.abort()
    }
  }, [serverUrl, userId])

  useEffect(() => {
    if (!session) return
    if (Object.keys(useHomeMixesStore.getState().byId).length > 0) return
    const { serverUrl, userId } = session
    void loadPersistedHomeMixes(serverUrl, userId).then(({ mixes: cached }) => {
      const current = useSessionStore.getState().session
      if (
        !current ||
        current.serverUrl !== serverUrl ||
        current.userId !== userId ||
        Object.keys(useHomeMixesStore.getState().byId).length > 0
      ) {
        return
      }
      if (cached.length > 0) useHomeMixesStore.getState().setMixes(cached)
    })
  }, [session])

  useEffect(() => {
    void refreshPlaylists()
  }, [refreshPlaylists])

  useEffect(() => {
    if (!context || !session) {
      browseAccountRef.current = null
      setBrowseGenres([])
      return
    }
    const account = `${session.serverUrl}\0${session.userId}`
    if (browseAccountRef.current !== account) {
      browseAccountRef.current = account
      setBrowseGenres([])
    }
    const controller = new AbortController()
    void (async () => {
      const cached = await loadPersistedBrowseGenres(session.serverUrl, session.userId)
      if (controller.signal.aborted || browseAccountRef.current !== account) return
      if (
        cached.items.length > 0 &&
        cached.version === BROWSE_GENRES_CACHE_VERSION
      ) {
        setBrowseGenres((prev) => (prev.length > 0 ? prev : cached.items))
      }
      if (!shouldRefreshBrowseGenres(cached)) return
      const result = await fetchBrowseGenres(
        context,
        session.userId,
        BROWSE_GENRES_PROBE_LIMIT,
        controller.signal,
        (entries) => {
          if (controller.signal.aborted || browseAccountRef.current !== account) return
          setBrowseGenres((prev) => mergeBrowseGenresForDisplay(prev, entries))
        },
      )
      if (
        controller.signal.aborted ||
        !result.ok ||
        browseAccountRef.current !== account
      ) {
        return
      }
      setBrowseGenres((prev) => mergeBrowseGenresForDisplay(prev, result.value))
      void persistBrowseGenres(session.serverUrl, session.userId, result.value)
    })()
    return () => controller.abort()
  }, [context, session])

  useEffect(() => {
    if (!context || !session) return
    if (!trimmed) {
      setSettledTerm('')
      setResults([])
      setIsFetching(false)
      setError(null)
      setFilter('all')
      return
    }
    const controller = new AbortController()
    setError(null)
    const handle = setTimeout(() => {
      setIsFetching(true)
      void searchLibrary(context, session.userId, trimmed, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        setIsFetching(false)
        if (!result.ok) {
          if (result.error.code === 'cancelled') return
          setError(result.error.message)
          return
        }
        setSettledTerm(trimmed)
        setResults(result.value)
        setError(null)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      controller.abort()
      clearTimeout(handle)
      setIsFetching(false)
    }
  }, [trimmed, context, session, retryNonce])

  const persistRecents = useCallback(
    (next: readonly string[]) => {
      setRecents(next)
      if (!session) return
      void writeJsonFile(searchRecentsPath(session.serverUrl, session.userId), {
        terms: next,
      })
    },
    [session],
  )

  const rememberTerm = useCallback(
    (raw: string) => {
      const next = upsertSearchRecent(recents, raw)
      if (next === recents) return
      persistRecents(next)
    },
    [recents, persistRecents],
  )

  const cancelSearch = useCallback(() => {
    setTerm('')
    setFocused(false)
    fieldRef.current?.blur()
    Keyboard.dismiss()
  }, [])

  const grouped = useMemo(() => groupSearchResults(results), [results])
  const sectionTitles = useMemo(
    () => ({
      songs: t('search.sectionSongs'),
      albums: t('search.sectionAlbums'),
      artists: t('search.sectionArtists'),
      playlists: t('search.sectionPlaylists'),
    }),
    [t],
  )
  const filterLabel = useCallback(
    (value: SearchFilter) => {
      if (value === 'all') return t('library.filterAll')
      if (value === 'songs') return t('search.sectionSongs')
      if (value === 'albums') return t('search.sectionAlbums')
      if (value === 'artists') return t('search.sectionArtists')
      return t('search.sectionPlaylists')
    },
    [t],
  )
  const sections = useMemo(
    () => searchSections(grouped, filter, sectionTitles),
    [filter, grouped, sectionTitles],
  )
  const searchRows = useMemo(
    () => flattenSearchSections(sections, filter === 'all'),
    [filter, sections],
  )
  const resultCount = groupedSearchCount(grouped)
  const hintRecents = prefixMatchRecents(recents, term)
  const querySettled = settledTerm === trimmed
  const showSegments = !browsing && resultCount > 0
  const showEmptyResults =
    !browsing && !isFetching && querySettled && resultCount === 0 && !error
  const genreGap = spacing.sm
  const genreW = Math.max(
    156,
    Math.floor((width - spacing.md * 2 - genreGap) / 2),
  )
  const genreH = Math.max(96, Math.round(genreW * 0.62))
  const listPad = useMemo(
    () => ({ paddingBottom: scrollUnderChromePad(insets.bottom) }),
    [insets.bottom],
  )

  const artFor = useCallback(
    (item: LibraryItem) =>
      context
        ? artworkUrl(
            context,
            item.imageItemId ?? item.albumId ?? item.id,
            item.imageTag,
            'thumb',
          )
        : undefined,
    [context],
  )

  const sampledGenres = useMemo(
    () => sampleBrowseGenresStable(browseGenres, BROWSE_GENRES_DISPLAY_LIMIT),
    [browseGenres],
  )

  const genreTiles = useMemo((): readonly GenreTileData[] => {
    return sampledGenres.map((entry) => {
      const albums = entry.sampleAlbums.length > 0 ? entry.sampleAlbums : [entry.genre]
      return {
        id: entry.genre.id,
        name: entry.genre.name,
        label: titleCaseGenreLabel(entry.genre.name) || entry.genre.name,
        fill: browseTileColor(entry.genre.id),
        arts: genreTileCovers(albums, entry.genre).map(artFor),
      }
    })
  }, [artFor, sampledGenres])

  const browseRows = useMemo((): readonly BrowseRow[] => {
    const rows: BrowseRow[] = []
    const pairs = pairItems(genreTiles)
    if (pairs.length > 0) {
      rows.push({ kind: 'heading', id: 'browse', title: t('search.browse') })
      for (const [left, right] of pairs) {
        rows.push({ kind: 'genrePair', id: left.id, left, right })
      }
    }
    if (exploreRows.length === 0) return rows
    rows.push({ kind: 'heading', id: 'playlists', title: t('search.playlistsForYou') })
    const mixArtOccupied = new Set<string>()
    for (const row of exploreRows) {
      if (row.kind === 'mix') {
        const mix = { ...row.mix, ...displayHomeMixCard(row.mix, mixCopy) }
        const covers = uniqueCollageItems(
          [...uniqueAlbumsFromTracks(mix.tracks), ...mix.tracks],
          4,
          mixArtOccupied,
        )
        rows.push({
          kind: 'mix',
          mix,
          arts: covers.map(artFor),
        })
      } else {
        rows.push({
          kind: 'playlist',
          playlist: row.playlist,
          art: artFor(row.playlist),
        })
      }
    }
    return rows
  }, [artFor, exploreRows, genreTiles, mixCopy, t])

  const requireSession = useCallback((): boolean => {
    if (context && session) return true
    Alert.alert(t('search.signInRequired'), t('search.signInManagePlaylists'))
    return false
  }, [context, session, t])

  const addPending = async (playlistId: string) => {
    if (!context || !session || !pendingTrackId || busy) return
    setBusy(true)
    try {
      const result = await addTracksToPlaylist(
        context,
        session.userId,
        playlistId,
        [pendingTrackId],
      )
      if (!result.ok) {
        Alert.alert(t('search.couldNotAddToPlaylist'), result.error.message)
        return
      }
      setPickerOpen(false)
      setCreateFromPicker(false)
      setPendingTrackId(null)
      await refreshPlaylists()
    } finally {
      setBusy(false)
    }
  }

  const createAndOpenPlaylist = async (
    name: string,
    ids: readonly string[],
    failTitle: string,
    onSuccess: () => void,
  ) => {
    if (!context || !session || busy || ids.length === 0) return
    setBusy(true)
    try {
      const result = await createPlaylist(context, session.userId, name, ids)
      if (!result.ok) {
        Alert.alert(failTitle, result.error.message)
        return
      }
      await upsertPlaylist({
        ...playlistStub(result.value, name, ids.length),
        type: 'Playlist',
        artists: [],
        durationMs: 0,
      })
      onSuccess()
      await refreshPlaylists()
      router.push(`/(app)/(main)/playlist/${result.value}`)
    } finally {
      setBusy(false)
    }
  }

  const createWithPending = async (name: string) => {
    if (!pendingTrackId) return
    await createAndOpenPlaylist(name, [pendingTrackId], t('search.couldNotCreatePlaylist'), () => {
      setCreateOpen(false)
      setCreateFromPicker(false)
      setPendingTrackId(null)
    })
  }

  const saveMixAsPlaylist = async (name: string) => {
    if (!saveMix) return
    const ids = saveMix.tracks.map((track) => track.id).filter((id) => id.length > 0)
    if (ids.length === 0) {
      Alert.alert(t('search.couldNotSaveMix'), t('search.mixHasNoTracks'))
      return
    }
    await createAndOpenPlaylist(name, ids, t('search.couldNotSaveMix'), () => setSaveMix(null))
  }

  const cancelCreate = () => {
    if (busy) return
    setCreateOpen(false)
    if (createFromPicker) {
      setCreateFromPicker(false)
      setPickerOpen(true)
      return
    }
    setPendingTrackId(null)
  }

  const openItem = useCallback(
    (item: LibraryItem) => {
      rememberTerm(trimmed || item.name)
      if (item.type === 'Audio') {
        const hero = context
          ? artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'hero')
          : undefined
        playQueue([toQueueTrack(item, hero)], 0)
        cancelSearch()
        return
      }
      if (item.type === 'MusicAlbum') router.push(`/(app)/(main)/album/${item.id}`)
      else if (item.type === 'MusicArtist') router.push(`/(app)/(main)/artist/${item.id}`)
      else if (item.type === 'MusicGenre') {
        router.push({
          pathname: '/(app)/(main)/genre/[id]',
          params: { id: item.id, name: item.name },
        })
      } else router.push(`/(app)/(main)/playlist/${item.id}`)
    },
    [cancelSearch, context, playQueue, rememberTerm, router, trimmed],
  )

  const onAudioLongPress = useCallback(
    (item: LibraryItem) => {
      const hero = context
        ? artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'hero')
        : undefined
      const queueTrack = toQueueTrack(item, hero)
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
            setPendingTrackId(item.id)
            setPickerOpen(true)
          },
          isFavorite: Boolean(item.isFavorite),
          onToggleFavorite: () => {
            if (!context || !session) {
              Alert.alert(t('search.signInRequired'), t('search.signInManagePlaylists'))
              return
            }
            void toggleFavoriteItem({
              context,
              userId: session.userId,
              itemId: item.id,
              currentlyFavorite: Boolean(item.isFavorite),
              onLocal: (next) => {
                setResults((prev) =>
                  prev.map((row) =>
                    row.id === item.id ? { ...row, isFavorite: next } : row,
                  ),
                )
              },
            })
          },
        }, t),
      )
    },
    [context, enqueueTracks, playNextTracks, requireSession, session, t],
  )

  const openMix = useCallback(
    (mix: CachedHomeMix) => {
      router.push(`/(app)/(main)/mix/${encodeURIComponent(mix.id)}`)
    },
    [router],
  )

  const openGenre = useCallback(
    (tile: GenreTileData) => {
      router.push({
        pathname: '/(app)/(main)/genre/[id]',
        params: { id: tile.id, name: tile.name },
      })
    },
    [router],
  )

  const recentsList =
    recents.length === 0 ? null : (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('search.recentSearches')}
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('search.clearRecents')}
            onPress={() => persistRecents([])}
            hitSlop={8}
          >
            <Text style={styles.clear}>{t('search.clearRecents')}</Text>
          </PressableScale>
        </View>
        {recents.map((entry) => (
          <RecentRow
            key={entry}
            entry={entry}
            onOpen={setTerm}
            onRemove={(term) => persistRecents(removeSearchRecent(recents, term))}
          />
        ))}
      </View>
    )

  const searchRecentsHeader =
    hintRecents.length === 0 ? null : (
      <View style={styles.searchRecents}>
        {hintRecents.map((entry) => (
          <RecentRow key={entry} entry={entry} onOpen={setTerm} />
        ))}
      </View>
    )

  const searchListHeader = (
    <>
      {searchRecentsHeader}
      {error ? (
        <View style={styles.searchStatus}>
          <Text style={styles.searchStatusText}>{error}</Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('search.retrySearch')}
            onPress={() => setRetryNonce((n) => n + 1)}
            hitSlop={8}
          >
            <Text style={styles.retry}>{t('search.retrySearch')}</Text>
          </PressableScale>
        </View>
      ) : null}
      {isFetching && resultCount === 0 && !error ? (
        <View style={styles.searchStatus}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.searchStatusText}>{t('search.searching')}</Text>
        </View>
      ) : null}
      {showEmptyResults ? (
        <View style={styles.emptyCopy} accessibilityRole="summary">
          <Text style={styles.emptyTitle}>{t('search.noResults')}</Text>
          <Text style={styles.emptyMessage}>{t('search.nothingMatched', { term: settledTerm })}</Text>
        </View>
      ) : null}
    </>
  )

  const renderBrowseItem = useCallback(
    ({ item }: { readonly item: BrowseRow }) => {
      if (item.kind === 'heading') {
        return (
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {item.title}
          </Text>
        )
      }
      if (item.kind === 'genrePair') {
        return (
          <View style={styles.genrePair}>
            <GenreTile tile={item.left} width={genreW} height={genreH} onPress={openGenre} />
            {item.right ? (
              <GenreTile tile={item.right} width={genreW} height={genreH} onPress={openGenre} />
            ) : (
              <View style={{ width: genreW, height: genreH }} />
            )}
          </View>
        )
      }
      if (item.kind === 'mix') {
        const { mix } = item
        return (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${mix.title}. ${mix.subtitle}`}
            accessibilityHint={t('search.longPressHint')}
            scaleTo={motion.scale.button}
            onPress={() => openMix(mix)}
            onLongPress={() => setSaveMix(mix)}
            style={styles.flatRow}
          >
            <MixCollage arts={item.arts} size={MIX_THUMB} radius={4} recyclingKey={mix.id} />
            <View style={styles.mixCopy}>
              <Text style={styles.flatTitle} numberOfLines={1}>
                {mix.title}
              </Text>
              <Text style={styles.flatSubtitle} numberOfLines={1}>
                {mix.subtitle}
              </Text>
            </View>
          </PressableScale>
        )
      }
      const { playlist } = item
      const count = playlist.childCount
      return (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={playlist.name}
          scaleTo={motion.scale.button}
          onPress={() => router.push(`/(app)/(main)/playlist/${playlist.id}`)}
          style={styles.flatRow}
        >
          <Artwork uri={item.art} recyclingKey={playlist.id} style={styles.playlistThumb} />
          <View style={styles.mixCopy}>
            <Text style={styles.flatTitle} numberOfLines={1}>
              {playlist.name}
            </Text>
            <Text style={styles.flatSubtitle} numberOfLines={1}>
              {count !== undefined
                ? t('playlistModal.playlistCount', { count })
                : t('track.playlist')}
            </Text>
          </View>
        </PressableScale>
      )
    },
    [genreH, genreW, openGenre, openMix, router, t],
  )

  const renderSearchItem = useCallback(
    ({ item }: { readonly item: SearchListRow }) => {
      if (item.kind === 'header') {
        return (
          <Text style={styles.resultHeader} accessibilityRole="header">
            {item.title}
          </Text>
        )
      }
      return (
        <TrackRow
          item={item.item}
          artworkUrl={artFor(item.item)}
          accessoryLabel={typeLabel(item.item.type, t)}
          onPress={() => openItem(item.item)}
          onLongPress={item.item.type === 'Audio' ? () => onAudioLongPress(item.item) : undefined}
          accessibilityHint={
            item.item.type === 'Audio' ? t('search.longPressHint') : undefined
          }
        />
      )
    },
    [artFor, onAudioLongPress, openItem, t],
  )

  const browseKey = useCallback((item: BrowseRow) => {
    if (item.kind === 'mix') return `mix:${item.mix.id}`
    if (item.kind === 'playlist') return `playlist:${item.playlist.id}`
    return `${item.kind}:${item.id}`
  }, [])

  const searchKey = useCallback(
    (item: SearchListRow) => (item.kind === 'header' ? `header:${item.title}` : item.item.id),
    [],
  )

  const listChrome = {
    keyboardDismissMode: 'on-drag' as const,
    keyboardShouldPersistTaps: 'handled' as const,
    showsVerticalScrollIndicator: false,
    style: styles.flexList,
    maintainVisibleContentPosition: LIST_SCROLL,
  }

  const browseBody = (
    <FlashList
      data={browseRows}
      keyExtractor={browseKey}
      renderItem={renderBrowseItem}
      getItemType={(item) => item.kind}
      ListHeaderComponent={recentsList}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={listPad}
      drawDistance={250}
      {...listChrome}
    />
  )

  const searchBody =
    error && resultCount === 0 && !isFetching ? (
      <FlashList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            <ErrorState
              message={error}
              onRetry={() => setRetryNonce((n) => n + 1)}
            />
            {searchRecentsHeader}
          </>
        }
        contentContainerStyle={listPad}
        {...listChrome}
      />
    ) : (
      <FlashList
        data={searchRows}
        keyExtractor={searchKey}
        renderItem={renderSearchItem}
        getItemType={(item) => item.kind}
        ListHeaderComponent={searchListHeader}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.list, listPad]}
        drawDistance={250}
        {...listChrome}
      />
    )

  return (
    <Screen padBottom={false} padHorizontal={false}>
      <View style={styles.chrome}>
        <Title>{t('search.title')}</Title>
        <View style={styles.searchRow}>
          <Field
            ref={fieldRef}
            containerStyle={styles.searchField}
            inset={false}
            leading={<Icon name="magnifyingglass" tintColor={colors.textSecondary} size={18} />}
            trailing={
              trimmed.length > 0 ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={t('search.clearSearch')}
                  hitSlop={8}
                  onPress={() => setTerm('')}
                  style={styles.searchClear}
                >
                  <Icon name="xmark.circle.fill" tintColor={colors.textSecondary} size={18} />
                </PressableScale>
              ) : null
            }
            accessibilityLabel={t('search.title')}
            value={term}
            onChangeText={setTerm}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => {
              if (trimmed) rememberTerm(trimmed)
            }}
            placeholder={t('search.placeholder')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            keyboardAppearance="dark"
            selectionColor={colors.accent}
            style={styles.searchInput}
          />
          {focused || trimmed.length > 0 ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t('search.cancel')}
              onPress={cancelSearch}
              hitSlop={8}
              style={styles.cancelPress}
            >
              <Text style={styles.cancel}>{t('search.cancel')}</Text>
            </PressableScale>
          ) : null}
        </View>
        {isFetching && !browsing && resultCount > 0 ? (
          <View style={styles.fetchingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
          </View>
        ) : null}
        {showSegments ? (
          <SegmentControl
            values={SEARCH_FILTERS}
            value={filter}
            onChange={setFilter}
            labelFor={filterLabel}
          />
        ) : null}
      </View>
      <View style={styles.body}>
        {browsing ? browseBody : searchBody}
      </View>
      <PlaylistPickerModal
        visible={pickerOpen}
        playlists={playlists}
        busy={busy}
        onCancel={() => {
          if (busy) return
          setPickerOpen(false)
          setCreateFromPicker(false)
          setPendingTrackId(null)
        }}
        onPick={(playlistId) => {
          void addPending(playlistId)
        }}
        onCreateNew={() => {
          setCreateFromPicker(true)
          setPickerOpen(false)
          setCreateOpen(true)
        }}
      />
      <PlaylistNameModal
        visible={createOpen}
        title={t('playlistModal.newPlaylist')}
        busy={busy}
        onCancel={cancelCreate}
        onSubmit={(name) => {
          void createWithPending(name)
        }}
      />
      <PlaylistNameModal
        visible={saveMix !== null}
        title={t('search.saveToLibrary')}
        initialName={
          saveMix ? displayHomeMixCard(saveMix, mixCopy).title : ''
        }
        busy={busy}
        onCancel={() => {
          if (busy) return
          setSaveMix(null)
        }}
        onSubmit={(name) => {
          void saveMixAsPlaylist(name)
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  chrome: {
    paddingHorizontal: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchField: {
    flex: 1,
    marginTop: 0,
  },
  searchInput: {
    fontWeight: '600',
  },
  searchClear: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelPress: {
    minHeight: 44,
    justifyContent: 'center',
    minWidth: 56,
    alignItems: 'flex-end',
  },
  cancel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  body: {
    flex: 1,
  },
  flexList: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.md,
  },
  searchRecents: {
    gap: 2,
    paddingBottom: spacing.sm,
  },
  fetchingRow: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  searchStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  searchStatusText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  retry: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 15,
  },
  section: {
    gap: 4,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.md,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  clear: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  recentHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  recentRemove: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  flatTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  recentTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  flatSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  mixCopy: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  playlistThumb: {
    width: MIX_THUMB,
    height: MIX_THUMB,
    borderRadius: 4,
  },
  genrePair: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  genreCard: {
    borderRadius: radii.md,
    overflow: 'hidden',
    isolation: 'isolate',
  },
  genreArt: {
    position: 'absolute',
    top: -GENRE_ART_BLEED,
    right: -GENRE_ART_BLEED,
    overflow: 'hidden',
    zIndex: 0,
  },
  genreCardFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 2,
  },
  genreScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  genreLabelWrap: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    zIndex: 3,
  },
  genreLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  resultHeader: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 22,
    letterSpacing: -0.4,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  emptyCopy: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 22,
    marginBottom: 0,
  },
  emptyMessage: {
    ...typography.body,
    color: colors.textSecondary,
  },
})
