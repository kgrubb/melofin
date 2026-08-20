import enCommon from '@/src/i18n/locales/en/common.json'
import svCommon from '@/src/i18n/locales/sv/common.json'
import isCommon from '@/src/i18n/locales/is/common.json'
import esCommon from '@/src/i18n/locales/es/common.json'
import frCommon from '@/src/i18n/locales/fr/common.json'
import deCommon from '@/src/i18n/locales/de/common.json'
import ptBRCommon from '@/src/i18n/locales/pt-BR/common.json'
import ptPTCommon from '@/src/i18n/locales/pt-PT/common.json'
import itCommon from '@/src/i18n/locales/it/common.json'
import nlCommon from '@/src/i18n/locales/nl/common.json'
import jaCommon from '@/src/i18n/locales/ja/common.json'
import koCommon from '@/src/i18n/locales/ko/common.json'
import zhCommon from '@/src/i18n/locales/zh/common.json'
import zhHantCommon from '@/src/i18n/locales/zh-Hant/common.json'
import nbCommon from '@/src/i18n/locales/nb/common.json'
import daCommon from '@/src/i18n/locales/da/common.json'
import fiCommon from '@/src/i18n/locales/fi/common.json'
import plCommon from '@/src/i18n/locales/pl/common.json'
import trCommon from '@/src/i18n/locales/tr/common.json'
import idCommon from '@/src/i18n/locales/id/common.json'
import thCommon from '@/src/i18n/locales/th/common.json'
import viCommon from '@/src/i18n/locales/vi/common.json'
import hiCommon from '@/src/i18n/locales/hi/common.json'
import ukCommon from '@/src/i18n/locales/uk/common.json'

export const defaultNS = 'common'

export const resources = {
  en: { common: enCommon },
  sv: { common: svCommon },
  is: { common: isCommon },
  es: { common: esCommon },
  fr: { common: frCommon },
  de: { common: deCommon },
  'pt-BR': { common: ptBRCommon },
  'pt-PT': { common: ptPTCommon },
  it: { common: itCommon },
  nl: { common: nlCommon },
  ja: { common: jaCommon },
  ko: { common: koCommon },
  zh: { common: zhCommon },
  'zh-Hant': { common: zhHantCommon },
  nb: { common: nbCommon },
  da: { common: daCommon },
  fi: { common: fiCommon },
  pl: { common: plCommon },
  tr: { common: trCommon },
  id: { common: idCommon },
  th: { common: thCommon },
  vi: { common: viCommon },
  hi: { common: hiCommon },
  uk: { common: ukCommon },
} as const

export type AppLanguage = keyof typeof resources

export type AppResources = (typeof resources)['en']
