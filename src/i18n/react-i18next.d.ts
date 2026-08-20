import 'i18next'
import { defaultNS, type AppResources } from '@/src/i18n/resources'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: AppResources
  }
}
