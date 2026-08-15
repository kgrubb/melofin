import { useEffect, useState } from 'react'
import { Alert, FlatList, Platform, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  artworkUrl,
  searchLibrary,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { addTracksToPlaylist, createPlaylist } from '@/src/services/jellyfin/playlists'
import { playlistStub } from '@/src/domain/playlists'
import { useLibraryStore } from '@/src/store/library'
import { useSessionStore } from '@/src/store/session'
import { usePlayerStore } from '@/src/store/player'
import { settleEntering, useMotionEnabled } from '@/src/theme/motion'
import { EmptyState, Field, Screen, Title } from '@/src/ui/primitives'
import {
  PlaylistNameModal,
  PlaylistPickerModal,
  presentTrackActions,
} from '@/src/ui/PlaylistActions'
import { buildTrackActions } from '@/src/ui/trackActions'
import { toggleFavoriteItem } from '@/src/services/jellyfin/favoriteToggle'
import { TrackRow } from '@/src/ui/TrackRow'
import { scrollUnderChromePad, spacing } from '@/src/theme/tokens'

const typeLabel = (type: string): string => {
  if (type === 'Audio') return 'Song'
  if (type === 'MusicAlbum') return 'Album'
  if (type === 'MusicArtist') return 'Artist'
  if (type === 'Playlist') return 'Playlist'
  return type
}

export default function SearchScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const enabled = useMotionEnabled()
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const playlists = useLibraryStore((s) => s.playlists)
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists)
  const upsertPlaylist = useLibraryStore((s) => s.upsertPlaylist)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const enqueueTracks = usePlayerStore((s) => s.enqueueTracks)
  const playNextTracks = usePlayerStore((s) => s.playNextTracks)
  const [term, setTerm] = useState('')
  const [settledTerm, setSettledTerm] = useState('')
  const [results, setResults] = useState<readonly LibraryItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null)
  const [createFromPicker, setCreateFromPicker] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!context || !session) return
    const controller = new AbortController()
    const handle = setTimeout(() => {
      void searchLibrary(context, session.userId, term, controller.signal).then((result) => {
        if (!result.ok) return
        setSettledTerm(term.trim())
        setResults(result.value)
      })
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [term, context, session])

  const requireSession = (): boolean => {
    if (context && session) return true
    Alert.alert('Sign in required', 'Sign in to manage playlists.')
    return false
  }

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
        Alert.alert('Couldn’t add to playlist', result.error.message)
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

  const createWithPending = async (name: string) => {
    if (!context || !session || !pendingTrackId || busy) return
    setBusy(true)
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
      setBusy(false)
    }
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

  const onAudioLongPress = (item: LibraryItem) => {
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
            Alert.alert('Sign in required', 'Sign in to manage favorites.')
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
      }),
    )
  }

  return (
    <Screen padBottom={false}>
      <Title>Search</Title>
      <Field
        accessibilityLabel="Search"
        value={term}
        onChangeText={setTerm}
        placeholder="Songs, albums, artists…"
        autoCapitalize="none"
        containerStyle={styles.field}
        inset
      />
      {results.length === 0 ? (
        <EmptyState
          title={settledTerm ? 'No results' : 'Search'}
          message={
            settledTerm
              ? `Nothing matched “${settledTerm}”.`
              : 'Type to search your library.'
          }
        />
      ) : (
        <Animated.View
          key={settledTerm}
          entering={settleEntering(enabled)}
          style={styles.listWrap}
        >
          <FlatList
            data={results}
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
            renderItem={({ item }) => {
              const art = context
                ? artworkUrl(
                    context,
                    item.imageItemId ?? item.id,
                    item.imageTag,
                    'thumb',
                  )
                : undefined
              const hero =
                context && item.type === 'Audio'
                  ? artworkUrl(
                      context,
                      item.imageItemId ?? item.id,
                      item.imageTag,
                      'hero',
                    )
                  : undefined
              return (
                <TrackRow
                  item={item}
                  artworkUrl={art}
                  accessoryLabel={typeLabel(item.type)}
                  onPress={() => {
                    if (item.type === 'Audio') {
                      playQueue([toQueueTrack(item, hero)], 0)
                      return
                    }
                    if (item.type === 'MusicAlbum') router.push(`/(app)/(main)/album/${item.id}`)
                    else if (item.type === 'MusicArtist')
                      router.push(`/(app)/(main)/artist/${item.id}`)
                    else router.push(`/(app)/(main)/playlist/${item.id}`)
                  }}
                  onLongPress={
                    item.type === 'Audio' ? () => onAudioLongPress(item) : undefined
                  }
                  accessibilityHint={
                    item.type === 'Audio' ? 'Long press for playlist actions' : undefined
                  }
                />
              )
            }}
          />
        </Animated.View>
      )}
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
        title="New playlist"
        busy={busy}
        onCancel={cancelCreate}
        onSubmit={(name) => {
          void createWithPending(name)
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  field: {
    marginBottom: spacing.md,
  },
  listWrap: {
    flex: 1,
  },
  list: {},
})
