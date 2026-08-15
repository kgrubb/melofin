import { describe, expect, it } from 'vitest'
import { buildTrackActions } from '@/src/ui/trackActions'

describe('buildTrackActions', () => {
  it('orders play next, queue, playlist, favorite', () => {
    const actions = buildTrackActions({
      onPlayNext: () => undefined,
      onAddToQueue: () => undefined,
      onStartRadio: () => undefined,
      onAddToPlaylist: () => undefined,
      onToggleFavorite: () => undefined,
      isFavorite: false,
      onTogglePlayed: () => undefined,
      isPlayed: false,
      extra: [{ text: 'Extra', style: 'destructive' }],
    })
    expect(actions.map((a) => a.text)).toEqual([
      'Play next',
      'Add to queue',
      'Start radio',
      'Add to playlist…',
      'Favorite',
      'Mark as Played',
      'Extra',
    ])
    expect(
      buildTrackActions({
        onPlayNext: () => undefined,
        onAddToQueue: () => undefined,
        onToggleFavorite: () => undefined,
        isFavorite: true,
        onTogglePlayed: () => undefined,
        isPlayed: true,
      }).map((a) => a.text),
    ).toEqual(['Play next', 'Add to queue', 'Unfavorite', 'Mark as Unplayed'])
  })
})
