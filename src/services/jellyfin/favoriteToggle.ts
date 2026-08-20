import { Alert } from 'react-native'
import i18n from '@/src/i18n'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import { markFavorite, unmarkFavorite } from '@/src/services/jellyfin/library'
import { usePlayerStore } from '@/src/store/player'

export const toggleFavoriteItem = async (opts: {
  readonly context: JellyfinContext
  readonly userId: string
  readonly itemId: string
  readonly currentlyFavorite: boolean
  readonly onLocal?: (next: boolean) => void
}): Promise<boolean> => {
  const next = !opts.currentlyFavorite
  opts.onLocal?.(next)
  usePlayerStore.getState().setTrackFavorite(opts.itemId, next)
  const result = next
    ? await markFavorite(opts.context, opts.userId, opts.itemId)
    : await unmarkFavorite(opts.context, opts.userId, opts.itemId)
  if (result.ok) return true
  opts.onLocal?.(!next)
  usePlayerStore.getState().setTrackFavorite(opts.itemId, !next)
  Alert.alert(i18n.t('library.couldNotUpdateFavorite'), result.error.message)
  return false
}
