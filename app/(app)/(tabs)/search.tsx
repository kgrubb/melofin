import { useEffect, useState } from 'react'
import { FlatList, Platform, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  artworkUrl,
  searchLibrary,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { useSessionStore } from '@/src/store/session'
import { usePlayerStore } from '@/src/store/player'
import { settleEntering, useMotionEnabled } from '@/src/theme/motion'
import { EmptyState, Field, Screen, Title } from '@/src/ui/primitives'
import { TrackRow } from '@/src/ui/TrackRow'
import { scrollUnderChromePad, spacing } from '@/src/theme/tokens'

export default function SearchScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const enabled = useMotionEnabled()
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const replaceQueue = usePlayerStore((s) => s.replaceQueue)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const [term, setTerm] = useState('')
  const [settledTerm, setSettledTerm] = useState('')
  const [results, setResults] = useState<readonly LibraryItem[]>([])

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
      />
      {results.length === 0 ? (
        <EmptyState title="Search" message="Type to search your library." />
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
                  accessoryLabel={item.type}
                  onPress={() => {
                    if (item.type === 'Audio') {
                      replaceQueue([toQueueTrack(item, hero)], 0)
                      setPlaying(true)
                      return
                    }
                    if (item.type === 'MusicAlbum') router.push(`/(app)/album/${item.id}`)
                    else if (item.type === 'MusicArtist')
                      router.push(`/(app)/artist/${item.id}`)
                    else router.push(`/(app)/playlist/${item.id}`)
                  }}
                />
              )
            }}
          />
        </Animated.View>
      )}
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
