import type { TFunction } from 'i18next'
import type { CastDevice, CastError } from '@/src/cast/types'

export const localizeCastLabel = (label: string, t: TFunction): string => {
  switch (label) {
    case 'This iPhone':
      return t('player.thisIphone')
    case 'This Android':
      return t('player.thisAndroid')
    case 'This Device':
      return t('player.thisDevice')
    case 'This Phone':
      return t('player.thisPhone')
    default:
      return label
  }
}

export const localizeCastSubtitle = (
  subtitle: string | undefined,
  t: TFunction,
): string | undefined => {
  if (!subtitle) return subtitle
  switch (subtitle) {
    case 'This device':
      return t('player.thisDevice')
    case 'Jellyfin device':
      return t('player.jellyfinDevice')
    case 'Jellyfin':
      return t('player.jellyfinClient')
    default:
      return subtitle
  }
}

export const localizeCastDevice = (
  device: CastDevice,
  t: TFunction,
): CastDevice => ({
  ...device,
  name: localizeCastLabel(device.name, t),
  subtitle: localizeCastSubtitle(device.subtitle, t),
})

export const castErrorMessageFromT = (error: CastError, t: TFunction): string => {
  switch (error.code) {
    case 'offline_track':
      return t('cast.errorOfflineTrack')
    case 'unreachable':
      return t('cast.errorUnreachable')
    case 'permission':
      return t('cast.errorPermission')
    case 'timeout':
      return t('cast.errorTimeout')
    case 'unsupported':
      return t('cast.errorUnsupported')
    case 'cancelled':
      return t('cast.errorCancelled')
    case 'auth':
      return t('cast.errorAuth')
    default:
      return error.message
  }
}
