import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
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
import { Artwork } from '@/src/ui/Artwork'
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
  const { id, name: nameParam } = useLocalSearchParams<{
    id: string
    name?: string
  }>()
  const genreId = String(id ?? '')
  const passedName =
    typeof nameParam === 'string' && nameParam.trim().length > 0
      ? nameParam
      : undefined
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const [genre, setGenre] = useState<LibraryItem | null>(null)
  const [albums, setAlbums] = useState<readonly LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filling, setFilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const paintedRef = useRef<readonly LibraryItem[]>([])

  const load = useCallback(async () => {
    if (!context || !session || !genreId) {
      setLoading(false)
      setFilling(false)
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const live = () => !ac.signal.aborted
    paintedRef.current = []
    setLoading(true)
    setFilling(false)
    setError(null)
    setAlbums([])
    setGenre(null)
    const applyPartial = (next: readonly LibraryItem[]) => {
      if (!live() || next.length === 0) return
      paintedRef.current = next
      setAlbums(next)
      setLoading(false)
      setFilling(true)
    }
    try {
      const [genreResult, albumsResult] = await Promise.all([
        fetchItem(context, session.userId, genreId),
        fetchAlbumsByGenre(context, session.userId, genreId, passedName, {
          onPartial: applyPartial,
          signal: ac.signal,
        }),
      ])
      if (!live()) return
      if (!genreResult.ok && !albumsResult.ok) {
        if (albumsResult.error.code !== 'cancelled') {
          setError(albumsResult.error.message)
        }
        return
      }
      if (genreResult.ok) setGenre(genreResult.value)
      const initialAlbums = albumsResult.ok
        ? albumsResult.value
        : paintedRef.current
      const resolvedName =
        passedName ?? (genreResult.ok ? genreResult.value.name : undefined)
      const retry =
        initialAlbums.length === 0 &&
        resolvedName &&
        resolvedName !== passedName
          ? await fetchAlbumsByGenre(
              context,
              session.userId,
              genreId,
              resolvedName,
              { onPartial: applyPartial, signal: ac.signal },
            )
          : null
      if (retry && !live()) return
      if (
        retry &&
        !retry.ok &&
        !albumsResult.ok &&
        retry.error.code !== 'cancelled'
      ) {
        setError(retry.error.message)
        return
      }
      const albums = retry?.ok ? retry.value : initialAlbums
      if (!live()) return
      setAlbums(albums)
      if (
        !albumsResult.ok &&
        albums.length === 0 &&
        albumsResult.error.code !== 'cancelled'
      ) {
        setError(albumsResult.error.message)
      }
    } catch {
      if (!live()) return
      setError('Failed to load genre')
    } finally {
      if (live()) {
        setFilling(false)
        setLoading(false)
      }
    }
  }, [context, genreId, passedName, session])

  useEffect(() => {
    void load()
    return () => abortRef.current?.abort()
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
            {passedName ?? genre?.name ?? 'Genre'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        {loading && albums.length === 0 ? (
          <LoadingState label="Loading genre" />
        ) : null}
        {error && albums.length === 0 ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !filling && !error && albums.length === 0 ? (
          <EmptyState title="No albums" message="Nothing in this genre yet." />
        ) : null}
        {albums.length > 0 ? (
          <FlashList
            data={albums}
            extraData={filling}
            keyExtractor={(item) => item.id}
            ListFooterComponent={
              filling ? (
                <View style={styles.footer}>
                  <ActivityIndicator color={colors.accent} />
                  <Muted>Finding more albums...</Muted>
                </View>
              ) : null
            }
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
                  <Artwork uri={art} style={styles.art} recyclingKey={item.id} />
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
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
