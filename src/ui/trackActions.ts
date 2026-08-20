import type { TFunction } from 'i18next'
import type { TrackActionButton } from '@/src/ui/PlaylistActions'

export type TrackActionHandlers = {
  readonly onPlayNext: () => void
  readonly onAddToQueue: () => void
  readonly onStartRadio?: () => void
  readonly onAddToPlaylist?: () => void
  readonly onToggleFavorite?: () => void
  readonly isFavorite?: boolean
  readonly onTogglePlayed?: () => void
  readonly isPlayed?: boolean
  readonly extra?: readonly TrackActionButton[]
}

/** Menu order: Play next -> queue -> radio -> playlist -> favorite -> played -> extras. */
export const buildTrackActions = (
  handlers: TrackActionHandlers,
  t: TFunction,
): readonly TrackActionButton[] => {
  const actions: TrackActionButton[] = [
    { text: t('track.playNext'), onPress: handlers.onPlayNext },
    { text: t('track.addToQueue'), onPress: handlers.onAddToQueue },
  ]
  if (handlers.onStartRadio) {
    actions.push({ text: t('track.startRadio'), onPress: handlers.onStartRadio })
  }
  if (handlers.onAddToPlaylist) {
    actions.push({ text: t('track.addToPlaylist'), onPress: handlers.onAddToPlaylist })
  }
  if (handlers.onToggleFavorite) {
    actions.push({
      text: handlers.isFavorite ? t('player.unfavorite') : t('player.favorite'),
      onPress: handlers.onToggleFavorite,
    })
  }
  if (handlers.onTogglePlayed) {
    actions.push({
      text: handlers.isPlayed ? t('track.markUnplayed') : t('track.markPlayed'),
      onPress: handlers.onTogglePlayed,
    })
  }
  if (handlers.extra) {
    for (const button of handlers.extra) actions.push(button)
  }
  return actions
}
