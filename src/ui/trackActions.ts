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
): readonly TrackActionButton[] => [
  { text: t('track.playNext'), onPress: handlers.onPlayNext },
  { text: t('track.addToQueue'), onPress: handlers.onAddToQueue },
  ...(handlers.onStartRadio
    ? [{ text: t('track.startRadio'), onPress: handlers.onStartRadio }]
    : []),
  ...(handlers.onAddToPlaylist
    ? [{ text: t('track.addToPlaylist'), onPress: handlers.onAddToPlaylist }]
    : []),
  ...(handlers.onToggleFavorite
    ? [
        {
          text: handlers.isFavorite ? t('player.unfavorite') : t('player.favorite'),
          onPress: handlers.onToggleFavorite,
        },
      ]
    : []),
  ...(handlers.onTogglePlayed
    ? [
        {
          text: handlers.isPlayed ? t('track.markUnplayed') : t('track.markPlayed'),
          onPress: handlers.onTogglePlayed,
        },
      ]
    : []),
  ...(handlers.extra ?? []),
]
