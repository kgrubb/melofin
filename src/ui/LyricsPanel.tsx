import { useEffect, useRef } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import {
  activeLyricIndex,
  seekMsForLine,
  type LyricLine,
  type LyricsPayload,
} from '@/src/domain/lyrics'
import { usePlayerStore } from '@/src/store/player'
import { colors, spacing, typography } from '@/src/theme/tokens'

type Props = {
  readonly lyrics: LyricsPayload | null
  readonly status: 'loading' | 'ready' | 'empty' | 'error'
  readonly reduceMotion: boolean
}

export const LyricsPanel = ({ lyrics, status, reduceMotion }: Props) => {
  const listRef = useRef<FlatList<LyricLine>>(null)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const lines = lyrics?.lines ?? []
  const synced = lyrics?.synced === true
  // Only re-render when the active line changes (not every position tick).
  const activeIndex = usePlayerStore((s) =>
    synced ? activeLyricIndex(lines, s.positionMs) : -1,
  )

  useEffect(() => {
    if (!synced || activeIndex < 0 || reduceMotion) return
    listRef.current?.scrollToIndex({
      index: activeIndex,
      animated: true,
      viewPosition: 0.35,
    })
  }, [activeIndex, reduceMotion, synced])

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <Text style={styles.secondary}>Loading lyrics…</Text>
      </View>
    )
  }
  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.secondary}>Couldn’t load lyrics</Text>
      </View>
    )
  }
  if (status === 'empty' || lines.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.secondary}>No lyrics for this track</Text>
      </View>
    )
  }

  const renderItem = ({ item, index }: ListRenderItemInfo<LyricLine>) => {
    const active = index === activeIndex
    const seekMs = seekMsForLine(item)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.text}
        disabled={seekMs === null}
        onPress={() => {
          if (seekMs !== null) seekTo(seekMs)
        }}
        style={styles.linePress}
      >
        <Text
          style={[
            styles.line,
            !synced || active ? styles.lineActive : styles.lineIdle,
          ]}
        >
          {item.text}
        </Text>
      </Pressable>
    )
  }

  return (
    <FlatList
      ref={listRef}
      data={lines}
      keyExtractor={(item, index) => `${index}:${item.startMs ?? 'p'}:${item.text}`}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, info.averageItemLength * info.index),
          animated: !reduceMotion,
        })
      }}
    />
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondary: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  list: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  linePress: {
    paddingVertical: spacing.sm,
  },
  line: {
    ...typography.title,
    textAlign: 'center',
  },
  lineActive: {
    color: colors.text,
  },
  lineIdle: {
    color: colors.textSecondary,
  },
})
