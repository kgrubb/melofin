import type { TrackActionButton } from '@/src/ui/PlaylistActions'

export type TrackActionHandlers = {
  readonly onPlayNext: () => void
  readonly onAddToQueue: () => void
  readonly onAddToPlaylist?: () => void
  readonly onToggleFavorite?: () => void
  readonly isFavorite?: boolean
  readonly onTogglePlayed?: () => void
  readonly isPlayed?: boolean
  readonly extra?: readonly TrackActionButton[]
}

/** Ordered Melio track menu: Play next → Add to queue → playlist → favorite → played → extras. */
export const buildTrackActions = (
  handlers: TrackActionHandlers,
): readonly TrackActionButton[] => {
  const actions: TrackActionButton[] = [
    { text: 'Play next', onPress: handlers.onPlayNext },
    { text: 'Add to queue', onPress: handlers.onAddToQueue },
  ]
  if (handlers.onAddToPlaylist) {
    actions.push({ text: 'Add to playlist…', onPress: handlers.onAddToPlaylist })
  }
  if (handlers.onToggleFavorite) {
    actions.push({
      text: handlers.isFavorite ? 'Unfavorite' : 'Favorite',
      onPress: handlers.onToggleFavorite,
    })
  }
  if (handlers.onTogglePlayed) {
    actions.push({
      text: handlers.isPlayed ? 'Mark as Unplayed' : 'Mark as Played',
      onPress: handlers.onTogglePlayed,
    })
  }
  if (handlers.extra) {
    for (const button of handlers.extra) actions.push(button)
  }
  return actions
}
