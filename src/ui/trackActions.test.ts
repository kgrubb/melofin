import { describe, expect, it } from 'vitest'
import i18n from 'i18next'
import ICU from 'i18next-icu'
import en from '@/src/i18n/locales/en/common.json'
import { buildTrackActions } from '@/src/ui/trackActions'

const t = (() => {
  void i18n.use(ICU).init({
    resources: { en: { common: en } },
    lng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })
  return i18n.getFixedT('en', 'common')
})()

describe('buildTrackActions', () => {
  it('orders play next, queue, playlist, favorite', () => {
    const actions = buildTrackActions(
      {
        onPlayNext: () => undefined,
        onAddToQueue: () => undefined,
        onStartRadio: () => undefined,
        onAddToPlaylist: () => undefined,
        onToggleFavorite: () => undefined,
        isFavorite: false,
        onTogglePlayed: () => undefined,
        isPlayed: false,
        extra: [{ text: 'Extra', style: 'destructive' }],
      },
      t,
    )
    expect(actions.map((a) => a.text)).toEqual([
      'Play next',
      'Add to queue',
      'Start radio',
      'Add to playlist...',
      'Favorite',
      'Mark as Played',
      'Extra',
    ])
    expect(
      buildTrackActions(
        {
          onPlayNext: () => undefined,
          onAddToQueue: () => undefined,
          onToggleFavorite: () => undefined,
          isFavorite: true,
          onTogglePlayed: () => undefined,
          isPlayed: true,
        },
        t,
      ).map((a) => a.text),
    ).toEqual(['Play next', 'Add to queue', 'Unfavorite', 'Mark as Unplayed'])
  })
})
