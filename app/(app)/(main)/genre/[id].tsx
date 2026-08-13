import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  artworkUrl,
  fetchAlbumsByGenre,
  fetchItem,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { useSessionStore } from '@/src/store/session'
import { PressableScale } from '@/src/theme/motion'
import { BackButton } from '@/src/ui/NavChrome'
import { EdgeBackGesture } from '@/src/ui/EdgeBackGesture'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  Screen,
} from '@/src/ui/primitives'
import { colors, motion, radii, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'

export default function GenreRoute() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const genreId = String(id ?? '')
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const [genre, setGenre] = useState<LibraryItem | null>(null)
  const [albums, setAlbums] = useState<readonly LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!context || !session || !genreId) return
    setLoading(true)
    setError(null)
    const [genreResult, albumsResult] = await Promise.all([
      fetchItem(context, session.userId, genreId),
      fetchAlbumsByGenre(context, session.userId, genreId),
    ])
    if (!genreResult.ok && !albumsResult.ok) {
      setError(albumsResult.error.message)
      setLoading(false)
      return
    }
    if (genreResult.ok) setGenre(genreResult.value)
    if (albumsResult.ok) setAlbums(albumsResult.value)
    else setError(albumsResult.error.message)
    setLoading(false)
  }, [context, genreId, session])

  useEffect(() => {
    void load()
  }, [load])

  const artFor = (item: LibraryItem) =>
    context
      ? artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'thumb')
      : undefined

  return (
    <Screen padBottom={false}>
      <EdgeBackGesture>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.sm) }]}>
          <BackButton
            onPress={() => {
              if (router.canGoBack()) router.back()
              else router.replace('/(app)/(main)/(tabs)/library')
            }}
          />
          <Text style={styles.title} numberOfLines={1}>
            {genre?.name ?? 'Genre'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        {loading ? <LoadingState label="Loading genre" /> : null}
        {error && albums.length === 0 ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && albums.length === 0 ? (
          <EmptyState title="No albums" message="Nothing in this genre yet." />
        ) : null}
        {albums.length > 0 ? (
          <FlashList
            data={albums}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              ...styles.list,
              paddingBottom: scrollUnderChromePad(insets.bottom),
            }}
            renderItem={({ item }) => {
              const art = artFor(item)
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  scaleTo={motion.scale.card}
                  onPress={() => router.push(`/(app)/(main)/album/${item.id}`)}
                  style={styles.row}
                >
                  {art ? (
                    <Image source={{ uri: art }} style={styles.art} />
                  ) : (
                    <View style={[styles.art, styles.artFallback]} />
                  )}
                  <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Muted>
                      {item.artists.join(', ') || 'Album'}
                    </Muted>
                  </View>
                </PressableScale>
              )
            }}
          />
        ) : null}
      </EdgeBackGesture>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerSpacer: { width: 40 },
  title: {
    ...typography.title,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  art: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
  },
  artFallback: {
    backgroundColor: colors.elevated,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
})
