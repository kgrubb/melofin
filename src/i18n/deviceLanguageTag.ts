import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

type ExpoLocalizationModule = {
  readonly getLocales: () => readonly { readonly languageTag?: string }[]
}

/** Device locale without crashing when ExpoLocalization is not in the dev client yet. */
export const readDeviceLanguageTag = (): string | undefined => {
  if (Platform.OS === 'web') {
    const { getLocales } = require('expo-localization') as typeof import('expo-localization')
    return getLocales()[0]?.languageTag
  }

  const localization = requireOptionalNativeModule<ExpoLocalizationModule>('ExpoLocalization')
  if (localization) {
    return localization.getLocales()[0]?.languageTag
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}
