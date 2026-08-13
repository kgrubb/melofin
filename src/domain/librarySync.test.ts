import { describe, expect, it } from 'vitest'
import {
  formatLibrarySyncButton,
  formatLibrarySyncedAt,
  formatLibrarySyncProgress,
  idleSyncProgress,
  librarySectionsEmpty,
  librarySyncFraction,
  librarySyncModeLabel,
  shouldSyncLibrary,
} from '@/src/domain/librarySync'

describe('librarySync', () => {
  it('decides sync by mode and trigger', () => {
    expect(
      shouldSyncLibrary({ mode: 'onOpen', trigger: 'open', isWifi: false }),
    ).toBe(true)
    expect(
      shouldSyncLibrary({ mode: 'wifiOnly', trigger: 'open', isWifi: false }),
    ).toBe(false)
    expect(
      shouldSyncLibrary({ mode: 'wifiOnly', trigger: 'open', isWifi: true }),
    ).toBe(true)
    expect(
      shouldSyncLibrary({ mode: 'manual', trigger: 'open', isWifi: true }),
    ).toBe(false)
    expect(
      shouldSyncLibrary({ mode: 'manual', trigger: 'manual', isWifi: false }),
    ).toBe(true)
  })

  it('labels modes and formats empty sections', () => {
    expect(librarySyncModeLabel('onOpen')).toBe('On open')
    expect(librarySyncModeLabel('wifiOnly')).toBe('Wi‑Fi only')
    expect(librarySyncModeLabel('manual')).toBe('Manual')
    expect(
      librarySectionsEmpty({ songs: [], albums: [], artists: [], playlists: [] }),
    ).toBe(true)
    expect(formatLibrarySyncedAt(null)).toBe('Never synced')
    expect(formatLibrarySyncedAt(1_700_000_000_000)).toContain('Last synced')
  })

  it('formats sync progress for the settings control', () => {
    expect(formatLibrarySyncButton(false, idleSyncProgress())).toBe('Sync now')
    expect(
      formatLibrarySyncProgress({
        phase: 'collections',
        songsLoaded: 0,
        songsTotal: 0,
      }),
    ).toBe('Updating collections…')
    expect(
      formatLibrarySyncProgress({
        phase: 'songs',
        songsLoaded: 250,
        songsTotal: 1000,
      }),
    ).toBe('Songs 250 of 1,000')
    expect(
      librarySyncFraction({
        phase: 'songs',
        songsLoaded: 250,
        songsTotal: 1000,
      }),
    ).toBe(0.25)
    expect(
      formatLibrarySyncButton(true, {
        phase: 'songs',
        songsLoaded: 250,
        songsTotal: 1000,
      }),
    ).toBe('Syncing 25%')
    expect(
      formatLibrarySyncButton(true, {
        phase: 'saving',
        songsLoaded: 1000,
        songsTotal: 1000,
      }),
    ).toBe('Saving…')
    expect(
      librarySyncFraction({
        phase: 'collections',
        songsLoaded: 0,
        songsTotal: 0,
      }),
    ).toBeNull()
  })
})
