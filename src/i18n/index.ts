import i18n from 'i18next'
import ICU from 'i18next-icu'
import { initReactI18next } from 'react-i18next'
import { readDeviceLanguageTag } from '@/src/i18n/deviceLanguageTag'
import { defaultNS, resources, type AppLanguage } from '@/src/i18n/resources'

const supportedLanguages = Object.keys(resources) as AppLanguage[]

const isSupported = (language: string): language is AppLanguage =>
  supportedLanguages.includes(language as AppLanguage)

const normalizeLanguage = (tag?: string | null): AppLanguage => {
  if (!tag) return 'en'

  const normalized = tag.toLowerCase().replace('_', '-')
  const parts = normalized.split('-')
  const base = parts[0] ?? 'en'
  const region = parts[1]

  if (base === 'pt') {
    if (region === 'pt') return 'pt-PT'
    return 'pt-BR'
  }

  if (base === 'zh') {
    const script = parts.find((part) => part === 'hant' || part === 'hans')
    if (script === 'hant' || region === 'tw' || region === 'hk' || region === 'mo') {
      return 'zh-Hant'
    }
    return 'zh'
  }

  if (base === 'nb' || base === 'no' || base === 'nn') {
    return 'nb'
  }

  if (isSupported(normalized)) return normalized
  if (isSupported(base)) return base

  return 'en'
}

const deviceTag = readDeviceLanguageTag()
const initialLanguage = normalizeLanguage(deviceTag)

void i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    resources,
    lng: initialLanguage,
    fallbackLng: 'en',
    defaultNS,
    ns: [defaultNS],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    returnEmptyString: false,
  })

export default i18n
