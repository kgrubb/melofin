import { describe, expect, it } from 'vitest'
import {
  formatLibrarySyncedAt,
  librarySectionsEmpty,
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
})
