import { Platform } from 'react-native'
import type { PlaybackSnapshot } from '@/src/cast/types'
import { currentTrack } from '@/src/domain/queue'
import { usePlayerStore } from '@/src/store/player'

export const localDeviceName = (): string => {
  if (Platform.OS === 'ios') return 'This iPhone'
  if (Platform.OS === 'android') return 'This Android'
  return 'This Device'
}

export const playbackSnapshot = (): PlaybackSnapshot | null => {
  const queue = usePlayerStore.getState()
  const track = currentTrack(queue)
  if (!track) return null
  return {
    track,
    queue: queue.tracks,
    currentIndex: queue.currentIndex,
    positionMs: queue.positionMs,
    isPlaying: queue.isPlaying,
    repeat: queue.repeat,
    shuffle: queue.shuffle,
  }
}

/** Item ids for a remote Play command, respecting Melofin shuffle order. */
export const remotePlayQueue = (
  snapshot: PlaybackSnapshot,
  shuffleOrder: readonly number[],
): { readonly itemIds: readonly string[]; readonly startIndex: number } => {
  if (snapshot.shuffle && shuffleOrder.length === snapshot.queue.length) {
    const pos = shuffleOrder.indexOf(snapshot.currentIndex)
    const from = pos >= 0 ? pos : 0
    const itemIds = shuffleOrder
      .slice(from)
      .map((i) => snapshot.queue[i]?.id)
      .filter((id): id is string => Boolean(id))
    return {
      itemIds: itemIds.length > 0 ? itemIds : [snapshot.track.id],
      startIndex: 0,
    }
  }
  const itemIds = snapshot.queue.map((t) => t.id)
  return {
    itemIds: itemIds.length > 0 ? itemIds : [snapshot.track.id],
    startIndex: itemIds.length > 0 ? Math.max(0, snapshot.currentIndex) : 0,
  }
}
