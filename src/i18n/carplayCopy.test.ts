import 'intl-pluralrules'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n from 'i18next'
import ICU from 'i18next-icu'
import { resources, type AppLanguage } from '@/src/i18n/resources'

type CommonJson = (typeof resources)['en']['common']

const get = (obj: CommonJson, path: string): unknown =>
  path.split('.').reduce<unknown>((cur, part) => {
    if (!cur || typeof cur !== 'object') return undefined
    return (cur as Record<string, unknown>)[part]
  }, obj)

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(ICU).init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      interpolation: { escapeValue: false },
    })
  }
})

describe('carplay i18n', () => {
  const enCarplay = get(resources.en.common, 'carplay') as Record<string, string>
  const localeCodes = Object.keys(resources) as AppLanguage[]

  it('has carplay keys in every locale', () => {
    for (const code of localeCodes) {
      const carplay = get(resources[code].common, 'carplay') as
        | Record<string, string>
        | undefined
      expect(carplay, code).toBeTruthy()
      expect(Object.keys(carplay!).sort(), code).toEqual(Object.keys(enCarplay).sort())
    }
  })

  it('aligns hub segment labels with library segments', () => {
    for (const code of localeCodes) {
      const data = resources[code].common
      const carplay = get(data, 'carplay') as Record<string, string>
      expect(carplay.songs, code).toBe(get(data, 'library.segmentSongs'))
      expect(carplay.genres, code).toBe(get(data, 'library.segmentGenres'))
    }
  })

  it('does not leave carplay copy in English for non-English locales', () => {
    const loanwords: Readonly<Partial<Record<AppLanguage, readonly string[]>>> = {
      de: ['genres', 'songs'],
      fr: ['genres'],
      nl: ['genres', 'shuffle'],
    }
    for (const code of localeCodes) {
      if (code === 'en') continue
      const carplay = get(resources[code].common, 'carplay') as Record<string, string>
      const allowed = new Set(loanwords[code] ?? [])
      for (const [key, value] of Object.entries(carplay)) {
        if (allowed.has(key)) continue
        expect(value, `${code}.carplay.${key}`).not.toBe(enCarplay[key])
      }
    }
  })

  it('resolves carplay copy through i18next for every locale', () => {
    for (const code of localeCodes) {
      void i18n.changeLanguage(code)
      expect(i18n.t('carplay.shuffleAll')).not.toBe('')
      expect(i18n.t('carplay.upNext')).not.toBe('')
      expect(i18n.t('carplay.remaining', { count: 3 })).not.toContain('carplay.')
    }
  })
})
