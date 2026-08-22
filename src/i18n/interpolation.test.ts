import 'intl-pluralrules'
import { describe, expect, it } from 'vitest'
import i18n from 'i18next'
import ICU from 'i18next-icu'
import en from '@/src/i18n/locales/en/common.json'

const t = (() => {
  void i18n.use(ICU).init({
    resources: { en: { common: en } },
    lng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })
  return i18n.getFixedT('en', 'common')
})()

describe('i18n ICU interpolation', () => {
  it('interpolates simple placeholders', () => {
    expect(t('track.byArtist', { name: 'Song', subtitle: 'Artist' })).toBe('Song by Artist')
    expect(t('player.playingOn', { name: 'Speaker' })).toBe('Playing on Speaker')
    expect(t('search.removeRecent', { entry: 'jazz' })).toBe('Remove jazz')
    expect(t('search.nothingMatched', { term: 'jazz' })).toBe('Nothing matched "jazz".')
    expect(t('home.shufflePlayMix', { title: 'Mix' })).toBe('Shuffle play Mix')
  })

  it('interpolates ICU plurals', () => {
    expect(t('player.minutes', { count: 1 })).toBe('1 minute')
    expect(t('player.minutes', { count: 5 })).toBe('5 minutes')
    expect(t('library.playlistCount', { count: 1 })).toBe('1 track')
    expect(t('library.playlistCount', { count: 12 })).toBe('12 tracks')
    expect(t('queue.clearUpcomingMessage', { count: 1 })).toBe(
      'Remove 1 track after the current song.',
    )
    expect(t('queue.clearUpcomingMessage', { count: 3 })).toBe(
      'Remove 3 tracks after the current song.',
    )
    expect(t('downloads.usedOf', { used: '1.2 KB', budget: '8 GB' })).toBe('1.2 KB of 8 GB')
    expect(t('downloads.emptyTitle')).toBe('Nothing saved yet')
  })
})
