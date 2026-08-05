import { useCallback, useEffect, useState } from 'react'
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatCollectionDuration } from '@/src/domain/format'
import {
  artworkUrl,
  fetchChildren,
  fetchItem,
  fetchPlaylistTracks,
  toQueueTrack,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { downloadTrack } from '@/src/offline/downloader'
import { useSessionStore } from '@/src/store/session'
import { usePlayerStore } from '@/src/store/player'
import { useSettingsStore } from '@/src/store/settings'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { Glass } from '@/src/theme/Glass'
import { PressableScale, settleEntering, useMotionEnabled } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { EdgeBackGesture } from '@/src/ui/EdgeBackGesture'
import {
  ErrorState,
  LoadingState,
  Muted,
  Screen,
} from '@/src/ui/primitives'
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

const BackChip = ({ onPress }: { readonly onPress: () => void }) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel="Back"
    scaleTo={motion.scale.button}
    onPress={onPress}
    style={styles.backPress}
  >
    <Glass style={styles.backGlass} contentStyle={styles.backInner} intensity={26}>
      <Icon name="chevron.left" tintColor={colors.text} size={20} />
    </Glass>
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
              size={40}
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
  const enabled = useMotionEnabled()
  const params = useLocalSearchParams<{ id: string | string[] }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const replaceQueue = usePlayerStore((s) => s.replaceQueue)
  const enqueueTracks = usePlayerStore((s) => s.enqueueTracks)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
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

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/library')
  }, [router])

  const load = useCallback(async () => {
    if (!context || !session || !id) return
    setLoading(true)
    setError(null)
    const [meta, children] = await Promise.all([
      fetchItem(context, session.userId, id),
      kind === 'playlist'
        ? fetchPlaylistTracks(context, session.userId, id)
        : fetchChildren(context, session.userId, id),
    ])
    setLoading(false)
    if (!children.ok) {
      setError(children.error.message)
      return
    }
    setTracks(children.value)
    setCollection(meta.ok ? meta.value : null)
  }, [context, session, id, kind])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <EdgeBackGesture>
        <Screen padBottom={false}>
          <View style={styles.topBar}>
            <BackChip onPress={goBack} />
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
            <BackChip onPress={goBack} />
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
      setPlaying(!isPlaying)
      return
    }
    replaceQueue(queueTracks, 0, source)
    setPlaying(true)
  }

  const downloadAll = () => {
    if (Platform.OS === 'web' || !context || !session || downloading) return
    setDownloading(true)
    void Promise.all(
      queueTracks.map((track) => downloadTrack(context, session.userId, track, 'user')),
    ).then(async (results) => {
      const last = results.find((result) => result.ok)
      if (last?.ok) await setOfflineIndex(last.value)
      setDownloading(false)
    })
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
        <Animated.View entering={settleEntering(enabled)} style={styles.body}>
          <View style={styles.topBar}>
            <BackChip onPress={goBack} />
          </View>
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
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
                  replaceQueue(queueTracks, index, source)
                  setPlaying(true)
                }}
                onLongPress={() => enqueueTracks([queueTracks[index]!])}
              />
            )}
          />
        </Animated.View>
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  backPress: {
    width: 40,
    height: 40,
  },
  backGlass: {
    borderRadius: radii.pill,
    width: 40,
    height: 40,
  },
  backInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
