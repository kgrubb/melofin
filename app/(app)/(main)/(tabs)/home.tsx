import { useCallback, useEffect, useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shuffleTracks, type QueueTrack } from '@/src/domain/queue'
import {
  artworkUrl,
  fetchFavoriteTracks,
  fetchInstantMix,
  fetchLatestAlbums,
  fetchRandomSongs,
  fetchRecentPlaylists,
  fetchResume,
  toQueueTrack,
  userImageUrl,
  type LibraryItem,
} from '@/src/services/jellyfin/library'
import { useSessionStore } from '@/src/store/session'
import { usePlayerStore } from '@/src/store/player'
import { useSettingsStore } from '@/src/store/settings'
import { AccentGradient } from '@/src/theme/Atmosphere'
import { PressableScale } from '@/src/theme/motion'
import { EmptyState, ErrorState, LoadingState, Muted, Screen } from '@/src/ui/primitives'
import { Icon } from '@/src/ui/Icon'
import { colors, motion, radii, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'

const Section = ({
  title,
  subtitle,
  items,
  onPressItem,
  artFor,
  large = false,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly items: readonly LibraryItem[]
  readonly onPressItem: (item: LibraryItem) => void
  readonly artFor: (item: LibraryItem) => string | undefined
  readonly large?: boolean
}) => {
  const { width } = useWindowDimensions()
  // Full-bleed rail: first card aligns to page inset, next cover peeks to the
  // physical screen edge (no empty gutter beside a clipped card).
  const pad = spacing.lg
  const gap = spacing.sm
  const visible = large ? 2.2 : 2.45
  const card = Math.max(
    112,
    Math.floor((width - pad - gap * Math.floor(visible)) / visible),
  )

  if (items.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {items.map((item) => {
          const art = artFor(item)
          const subtitleText = item.artists.filter(Boolean).join(', ') || item.album
          return (
            <PressableScale
              key={item.id}
              onPress={() => onPressItem(item)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              scaleTo={motion.scale.card}
              style={[styles.card, { width: card }]}
            >
              {art ? (
                <Image source={{ uri: art }} style={[styles.art, { width: card, height: card }]} />
              ) : (
                <View style={[styles.art, styles.artFallback, { width: card, height: card }]} />
              )}
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.name}
              </Text>
              {subtitleText ? (
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {subtitleText}
                </Text>
              ) : null}
            </PressableScale>
          )
        })}
      </ScrollView>
    </View>
  )
}

const ShuffleChip = ({
  label,
  icon,
  onPress,
  primary = false,
  busy = false,
}: {
  readonly label: string
  readonly icon: string
  readonly onPress: () => void
  readonly primary?: boolean
  readonly busy?: boolean
}) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ busy, disabled: busy }}
    disabled={busy}
    scaleTo={motion.scale.button}
    onPress={onPress}
    style={styles.shufflePress}
  >
    {primary ? (
      <AccentGradient style={styles.shufflePrimary}>
        <Icon name={icon} tintColor={colors.onAccent} size={22} />
        <Text style={styles.shufflePrimaryLabel}>{label}</Text>
      </AccentGradient>
    ) : (
      <View style={styles.shuffleSecondary}>
        <Icon name={icon} tintColor={colors.text} size={22} />
        <Text style={styles.shuffleLabel}>{label}</Text>
      </View>
    )}
  </PressableScale>
)

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const offlineIndex = useSettingsStore((s) => s.offlineIndex)
  const [albums, setAlbums] = useState<readonly LibraryItem[]>([])
  const [resume, setResume] = useState<readonly LibraryItem[]>([])
  const [listenNow, setListenNow] = useState<readonly LibraryItem[]>([])
  const [playlists, setPlaylists] = useState<readonly LibraryItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [profileFailed, setProfileFailed] = useState(false)

  useEffect(() => {
    setProfileFailed(false)
  }, [session?.userId])

  const toHeroTracks = useCallback(
    (items: readonly LibraryItem[]): readonly QueueTrack[] =>
      items.map((item) =>
        toQueueTrack(
          item,
          context
            ? artworkUrl(
                context,
                item.imageItemId ?? item.id,
                item.imageTag,
                'hero',
              )
            : undefined,
        ),
      ),
    [context],
  )

  const playShuffled = useCallback(
    (tracks: readonly QueueTrack[]) => {
      if (tracks.length === 0) return
      playQueue(shuffleTracks(tracks, Date.now()), 0)
    },
    [playQueue],
  )

  const load = useCallback(async () => {
    if (!context || !session) return
    setLoading(true)
    const [a, r, p] = await Promise.all([
      fetchLatestAlbums(context, session.userId),
      fetchResume(context, session.userId),
      fetchRecentPlaylists(context, session.userId),
    ])
    const failed = [a, r, p].find((result) => !result.ok)
    if (failed && !failed.ok) {
      setLoading(false)
      setError(failed.error.message)
      return
    }
    setError(null)
    const nextAlbums = a.ok ? a.value : []
    const nextResume = r.ok ? r.value : []
    const nextPlaylists = p.ok ? p.value : []
    setAlbums(nextAlbums)
    setResume(nextResume)
    setPlaylists(nextPlaylists)

    const seed = nextResume[0] ?? nextAlbums[0] ?? nextPlaylists[0]
    if (seed) {
      const mix = await fetchInstantMix(context, session.userId, seed.id)
      setListenNow(mix.ok ? mix.value : [])
    } else {
      setListenNow([])
    }
    setLoading(false)
  }, [context, session])

  useEffect(() => {
    void load()
  }, [load])

  const artFor = (item: LibraryItem) =>
    context
      ? artworkUrl(context, item.imageItemId ?? item.id, item.imageTag, 'card')
      : undefined

  const openItem = (item: LibraryItem) => {
    if (item.type === 'Audio') {
      playQueue(toHeroTracks([item]), 0)
      return
    }
    if (item.type === 'MusicAlbum') {
      router.push(`/(app)/album/${item.id}`)
      return
    }
    if (item.type === 'MusicArtist') {
      router.push(`/(app)/artist/${item.id}`)
      return
    }
    router.push(`/(app)/playlist/${item.id}`)
  }

  const shuffleAll = async () => {
    if (!context || !session || busy) return
    setBusy('all')
    const result = await fetchRandomSongs(context, session.userId, 100)
    setBusy(null)
    if (!result.ok || result.value.length === 0) return
    playShuffled(toHeroTracks(result.value))
  }

  const shuffleFavorites = async () => {
    if (!context || !session || busy) return
    setBusy('favorites')
    const result = await fetchFavoriteTracks(context, session.userId)
    setBusy(null)
    if (!result.ok || result.value.length === 0) return
    playShuffled(toHeroTracks(result.value))
  }

  const shuffleDownloads = () => {
    if (busy) return
    const tracks = Object.values(offlineIndex.entries)
      .filter((entry) => entry.complete)
      .map((entry) =>
        toQueueTrack(
          {
            id: entry.itemId,
            name: entry.title,
            type: 'Audio',
            artists: [entry.artist],
            album: entry.album,
            durationMs: entry.durationMs,
          },
          entry.artworkPath,
        ),
      )
    if (tracks.length === 0) return
    playShuffled(tracks)
  }

  if (loading) {
    return (
      <Screen padBottom={false} padHorizontal={false}>
        <View style={styles.padded}>
          <LoadingState />
        </View>
      </Screen>
    )
  }

  if (error) {
    return (
      <Screen padBottom={false} padHorizontal={false}>
        <View style={styles.padded}>
          <ErrorState message={error} onRetry={() => void load()} />
        </View>
      </Screen>
    )
  }

  const empty =
    resume.length === 0 &&
    listenNow.length === 0 &&
    albums.length === 0 &&
    playlists.length === 0

  const profileUrl =
    context && session && !profileFailed
      ? userImageUrl(context, session.userId, undefined, 'thumb')
      : undefined

  return (
    <Screen padBottom={false} padHorizontal={false}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Profile and settings"
          scaleTo={motion.scale.button}
          onPress={() => router.push('/(app)/settings')}
          style={styles.avatarPress}
          hitSlop={8}
        >
          {profileUrl ? (
            <Image
              source={{ uri: profileUrl }}
              style={styles.avatar}
              contentFit="cover"
              recyclingKey={session?.userId}
              onError={() => setProfileFailed(true)}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {(session?.userName ?? '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
        </PressableScale>
      </View>
      {empty ? (
        <View style={styles.padded}>
          <EmptyState title="Nothing here" message="Add music on your Jellyfin server." />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: scrollUnderChromePad(insets.bottom) },
          ]}
        >
          <View style={styles.shuffleRow}>
            <ShuffleChip
              label={busy === 'all' ? 'Loading…' : 'Shuffle all'}
              icon="shuffle"
              primary
              busy={busy === 'all'}
              onPress={() => void shuffleAll()}
            />
            <ShuffleChip
              label={busy === 'favorites' ? 'Loading…' : 'Favorites'}
              icon="heart.fill"
              busy={busy === 'favorites'}
              onPress={() => void shuffleFavorites()}
            />
            <ShuffleChip
              label="Downloads"
              icon="arrow.down.circle.fill"
              busy={busy !== null}
              onPress={shuffleDownloads}
            />
          </View>

          <Section
            title="Continue Listening"
            subtitle="Pick up where you left off"
            items={resume}
            onPressItem={openItem}
            artFor={artFor}
            large
          />
          <Section
            title="Listen Now"
            subtitle="An instant mix based on your listening"
            items={listenNow}
            onPressItem={openItem}
            artFor={artFor}
          />
          <Section
            title="Recently Added"
            items={albums}
            onPressItem={openItem}
            artFor={artFor}
          />
          <Section
            title="Recent Playlists"
            items={playlists}
            onPressItem={openItem}
            artFor={artFor}
          />
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  padded: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  avatarPress: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.elevated,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
  },
  avatarInitial: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  scroll: {
    gap: spacing.xl,
  },
  shuffleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  shufflePress: {
    flex: 1,
    minWidth: 0,
  },
  shufflePrimary: {
    minHeight: 52,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  shufflePrimaryLabel: {
    color: colors.onAccent,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  shuffleSecondary: {
    minHeight: 52,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  shuffleLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    gap: 2,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  rail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  card: {
    gap: 6,
  },
  art: {
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
  },
  artFallback: {
    backgroundColor: colors.elevated,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: -0.1,
  },
  cardSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
})
