import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  playingIdentity,
  queueViewIndices,
  upcomingCount,
  type QueueTrack,
} from '@/src/domain/queue'
import { usePlayerStore } from '@/src/store/player'
import { PressableScale } from '@/src/theme/motion'
import { CloseChip } from '@/src/ui/NavChrome'
import { Screen } from '@/src/ui/primitives'
import { Icon } from '@/src/ui/Icon'
import { TRACK_ROW_HEIGHT, TrackRow } from '@/src/ui/TrackRow'
import { queueDragDropIndex, queueDragRowShift } from '@/src/ui/queueDrag'
import { colors, motion, radii, spacing, typography } from '@/src/theme/tokens'

const rowItem = (track: QueueTrack) => ({
  id: track.queueEntryId ?? track.id,
  name: track.title,
  type: 'Audio',
  artists: track.artist ? [track.artist] : [],
  album: track.album,
})

type QueueRowModel = {
  readonly track: QueueTrack
  readonly storeIndex: number
  readonly viewIndex: number
}

const QueueRow = memo(function QueueRow({
  model,
  active,
  recommended,
  canDrag,
  dragFrom,
  dragTy,
  viewLen,
  onRemove,
  onPlay,
  onDragStart,
  onDragCommit,
  onDragCancel,
}: {
  readonly model: QueueRowModel
  readonly active: boolean
  readonly recommended: boolean
  readonly canDrag: boolean
  readonly dragFrom: SharedValue<number>
  readonly dragTy: SharedValue<number>
  readonly viewLen: SharedValue<number>
  readonly onRemove: () => void
  readonly onPlay: () => void
  readonly onDragStart: () => void
  readonly onDragCommit: (from: number, to: number) => void
  readonly onDragCancel: () => void
}) {
  const { t } = useTranslation()
  const viewIndexSV = useSharedValue(model.viewIndex)
  viewIndexSV.value = model.viewIndex

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canDrag)
        .activeOffsetY([-8, 8])
        .failOffsetX([-24, 24])
        .onStart(() => {
          cancelAnimation(dragTy)
          dragFrom.value = viewIndexSV.value
          dragTy.value = 0
          runOnJS(onDragStart)()
        })
        .onUpdate((event) => {
          dragTy.value = event.translationY
        })
        .onFinalize((event, success) => {
          if (dragFrom.value !== viewIndexSV.value) return
          const from = dragFrom.value
          const to = queueDragDropIndex(
            from,
            event.translationY,
            viewLen.value,
            TRACK_ROW_HEIGHT,
          )
          if (!success || from < 1 || from === to) {
            dragTy.value = withTiming(0, { duration: motion.duration.fast }, (finished) => {
              if (!finished || dragFrom.value !== from) return
              dragFrom.value = -1
              dragTy.value = 0
              runOnJS(onDragCancel)()
            })
            return
          }
          dragTy.value = withTiming(
            (to - from) * TRACK_ROW_HEIGHT,
            { duration: motion.duration.fast },
            (finished) => {
              if (dragFrom.value !== from) return
              if (finished) {
                runOnJS(onDragCommit)(from, to)
                return
              }
              dragFrom.value = -1
              dragTy.value = 0
              runOnJS(onDragCancel)()
            },
          )
        }),
    [canDrag, dragFrom, dragTy, viewLen, viewIndexSV, onDragStart, onDragCommit, onDragCancel],
  )

  const animatedStyle = useAnimatedStyle(() => {
    const from = dragFrom.value
    const index = viewIndexSV.value
    if (from < 0) {
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        zIndex: 0,
        backgroundColor: 'transparent',
        shadowOpacity: 0,
        elevation: 0,
      }
    }
    if (index === from) {
      return {
        transform: [{ translateY: dragTy.value }, { scale: 1.03 }],
        zIndex: 20,
        backgroundColor: colors.elevated,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
      }
    }
    const to = queueDragDropIndex(from, dragTy.value, viewLen.value, TRACK_ROW_HEIGHT)
    return {
      transform: [
        { translateY: queueDragRowShift(index, from, to, TRACK_ROW_HEIGHT) },
        { scale: 1 },
      ],
      zIndex: 0,
      backgroundColor: 'transparent',
      shadowOpacity: 0,
      elevation: 0,
    }
  })

  return (
    <Animated.View style={[styles.item, animatedStyle]}>
      <View style={styles.rowBody}>
        <TrackRow
          item={rowItem(model.track)}
          artworkUrl={model.track.artworkUrl}
          selected={active}
          accessoryLabel={recommended ? t('queue.recommended') : undefined}
          onPress={onPlay}
        />
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('queue.remove', { title: model.track.title })}
        scaleTo={motion.scale.button}
        onPress={onRemove}
        style={styles.iconHit}
      >
        <Icon name="minus.circle.fill" tintColor={colors.danger} size={22} />
      </PressableScale>
      <GestureDetector gesture={drag}>
        <View
          accessibilityRole={canDrag ? 'adjustable' : 'none'}
          accessibilityLabel={canDrag ? t('queue.reorder', { title: model.track.title }) : undefined}
          style={[styles.iconHit, canDrag ? null : styles.iconDisabled]}
        >
          <Icon
            name="line.3.horizontal"
            tintColor={canDrag ? colors.textSecondary : colors.hairline}
            size={22}
          />
        </View>
      </GestureDetector>
    </Animated.View>
  )
})

export default function QueueScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tracks = usePlayerStore((s) => s.tracks)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const shuffleOrder = usePlayerStore((s) => s.shuffleOrder)
  const autoplayAnchorIndex = usePlayerStore((s) => s.autoplayAnchorIndex)
  const clearUpcomingTracks = usePlayerStore((s) => s.clearUpcomingTracks)
  const [dragging, setDragging] = useState(false)
  const dragFrom = useSharedValue(-1)
  const dragTy = useSharedValue(0)
  const viewLen = useSharedValue(1)
  const pendingClearRef = useRef(false)
  const upcomingCountValue = upcomingCount({
    tracks,
    currentIndex,
    shuffle,
    shuffleOrder,
    repeat: 'off',
  })
  const rows = useMemo((): readonly QueueRowModel[] => {
    const indices = queueViewIndices({
      tracks,
      currentIndex,
      shuffle,
      shuffleOrder,
      repeat: 'off',
    })
    return indices.flatMap((storeIndex, viewIndex) => {
      const track = tracks[storeIndex]
      return track ? [{ track, storeIndex, viewIndex }] : []
    })
  }, [tracks, currentIndex, shuffle, shuffleOrder])
  const currentKey = playingIdentity(tracks[currentIndex])
  viewLen.value = rows.length

  const onDragStart = useCallback(() => {
    setDragging(true)
  }, [])
  const onDragCancel = useCallback(() => {
    pendingClearRef.current = false
    setDragging(false)
  }, [])
  const onDragCommit = useCallback((from: number, to: number) => {
    pendingClearRef.current = true
    if (from !== to) usePlayerStore.getState().moveQueueViewTrack(from, to)
    setDragging(false)
  }, [])

  useLayoutEffect(() => {
    if (!pendingClearRef.current) return
    pendingClearRef.current = false
    dragFrom.value = -1
    dragTy.value = 0
  }, [dragging, rows, dragFrom, dragTy])

  useEffect(() => {
    if (dragFrom.value < 0) return
    pendingClearRef.current = false
    dragFrom.value = -1
    dragTy.value = 0
    setDragging(false)
  }, [currentKey, dragFrom, dragTy])

  return (
    <Screen padBottom={false} padTop={false}>
      <View style={styles.topBar}>
        <CloseChip
          onPress={() => {
            if (router.canGoBack()) router.back()
          }}
        />
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {t('queue.title')}
        </Text>
        {upcomingCountValue > 0 ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('queue.clearUpcoming')}
            scaleTo={motion.scale.button}
            hitSlop={8}
            onPress={() => {
              Alert.alert(
                t('queue.clearUpcomingTitle'),
                t('queue.clearUpcomingMessage', { count: upcomingCountValue }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('queue.clear'),
                    style: 'destructive',
                    onPress: () => clearUpcomingTracks(),
                  },
                ],
              )
            }}
          >
            <Text style={styles.clearLabel}>{t('queue.clear')}</Text>
          </PressableScale>
        ) : null}
      </View>
      <FlatList
        data={rows}
        extraData={`${currentKey}:${autoplayAnchorIndex ?? ''}:${dragging}`}
        keyExtractor={(item) => item.track.queueEntryId ?? `${item.track.id}-${item.storeIndex}`}
        style={styles.flexList}
        scrollEnabled={!dragging}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: TRACK_ROW_HEIGHT,
          offset: TRACK_ROW_HEIGHT * index,
          index,
        })}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        renderItem={({ item }) => (
          <QueueRow
            model={item}
            active={playingIdentity(item.track) === currentKey}
            recommended={
              autoplayAnchorIndex != null &&
              autoplayAnchorIndex > 0 &&
              item.storeIndex >= autoplayAnchorIndex
            }
            canDrag={rows.length > 1 && item.viewIndex > 0}
            dragFrom={dragFrom}
            dragTy={dragTy}
            viewLen={viewLen}
            onPlay={() => {
              if (dragging) return
              usePlayerStore.getState().playQueueViewIndex(item.viewIndex)
            }}
            onRemove={() => {
              if (dragging) return
              usePlayerStore.getState().removeTrackAt(item.storeIndex)
            }}
            onDragStart={onDragStart}
            onDragCommit={onDragCommit}
            onDragCancel={onDragCancel}
          />
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.text,
    flex: 1,
  },
  clearLabel: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '600',
  },
  flexList: {
    flex: 1,
    overflow: 'visible',
  },
  list: {
    paddingTop: spacing.xs,
    overflow: 'visible',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TRACK_ROW_HEIGHT,
    borderRadius: radii.sm,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  iconHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDisabled: {
    opacity: 0.35,
  },
})
