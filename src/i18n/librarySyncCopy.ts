import type { TFunction } from 'i18next'
import {
  librarySyncFraction,
  type LibrarySyncMode,
  type LibrarySyncProgress,
} from '@/src/domain/librarySync'

export const librarySyncModeLabelFromT = (
  mode: LibrarySyncMode,
  t: TFunction,
): string => {
  if (mode === 'onOpen') return t('settings.syncModeOnOpen')
  if (mode === 'wifiOnly') return t('settings.syncModeWifiOnly')
  return t('settings.syncModeManual')
}

export const formatLibrarySyncedAtLabel = (
  syncedAt: number | null,
  t: TFunction,
): string => {
  if (syncedAt === null) return t('settings.neverSynced')
  return t('settings.lastSynced', { date: new Date(syncedAt).toLocaleString() })
}

export const formatLibrarySyncProgressLabel = (
  progress: LibrarySyncProgress,
  t: TFunction,
): string => {
  if (progress.phase === 'collections') return t('settings.updatingCollections')
  if (progress.phase === 'saving') return t('settings.savingToDevice')
  if (progress.phase === 'songs') {
    const loaded = progress.songsLoaded
    const total = progress.songsTotal
    if (total > 0) {
      return t('settings.songsProgress', {
        loaded: loaded.toLocaleString(),
        total: total.toLocaleString(),
      })
    }
    if (loaded > 0) return t('settings.songsLoading', { loaded: loaded.toLocaleString() })
    return t('settings.fetchingSongs')
  }
  return t('settings.syncing')
}

export const formatLibrarySyncButtonLabel = (
  syncing: boolean,
  progress: LibrarySyncProgress,
  t: TFunction,
): string => {
  if (!syncing) return t('settings.syncNow')
  if (progress.phase === 'saving') return t('settings.saving')
  const fraction = librarySyncFraction(progress)
  if (fraction != null) {
    return t('settings.syncingPercent', { percent: Math.round(fraction * 100) })
  }
  return t('settings.syncing')
}
