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
  songDeltaWatermarkMs,
  songSyncAfterDelta,
  songSyncFetchPlan,
  songSyncPhase,
  libraryCacheBelongsToSession,
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
    expect(librarySyncModeLabel('wifiOnly')).toBe('Wi-Fi only')
    expect(librarySyncModeLabel('manual')).toBe('Manual')
    expect(
      librarySectionsEmpty({ songs: [], albums: [], artists: [], playlists: [] }),
    ).toBe(true)
    expect(formatLibrarySyncedAt(null)).toBe('Never synced')
    expect(formatLibrarySyncedAt(1_700_000_000_000)).toContain('Last synced')
  })

  it('formats sync progress for the settings control', () => {
    expect(formatLibrarySyncButton(false, idleSyncProgress())).toBe('Sync Now')
    expect(
      formatLibrarySyncProgress({
        phase: 'collections',
        songsLoaded: 0,
        songsTotal: 0,
      }),
    ).toBe('Updating collections...')
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
    ).toBe('Saving...')
    expect(
      librarySyncFraction({
        phase: 'collections',
        songsLoaded: 0,
        songsTotal: 0,
      }),
    ).toBeNull()
  })

  it('picks song sync phase without using trigger', () => {
    expect(
      songSyncPhase({
        schemaStale: false,
        songsSyncedAt: 1_700_000_000_000,
        localCount: 10,
      }),
    ).toBe('delta')
    expect(
      songSyncPhase({
        schemaStale: true,
        songsSyncedAt: 1_700_000_000_000,
        localCount: 10,
      }),
    ).toBe('full')
    expect(
      songSyncPhase({ schemaStale: false, songsSyncedAt: null, localCount: 10 }),
    ).toBe('full')
    expect(
      songSyncPhase({
        schemaStale: false,
        songsSyncedAt: 1_700_000_000_000,
        localCount: 0,
      }),
    ).toBe('full')
  })

  it('resolves delta outcomes from counts', () => {
    expect(
      songSyncAfterDelta({ remoteCount: 100, localCount: 100, deltaLength: 0 }),
    ).toBe('skip')
    expect(
      songSyncAfterDelta({ remoteCount: 100, localCount: 100, deltaLength: 3 }),
    ).toBe('upsertOk')
    expect(
      songSyncAfterDelta({ remoteCount: 100, localCount: 97, deltaLength: 0 }),
    ).toBe('full')
    expect(
      songSyncAfterDelta({ remoteCount: 100, localCount: 99, deltaLength: 2 }),
    ).toBe('full')
  })

  it('stamps watermark from pull start and plans wifi pages', () => {
    expect(songDeltaWatermarkMs(1_000_060_000)).toBe(1_000_000_000)
    expect(songSyncFetchPlan(true)).toEqual({ pageSize: 400, concurrency: 2 })
    expect(songSyncFetchPlan(false)).toEqual({ pageSize: 200, concurrency: 1 })
  })

  it('treats missing userId as the same account on the same server', () => {
    expect(
      libraryCacheBelongsToSession(
        { serverUrl: 'https://jf', userId: null },
        { serverUrl: 'https://jf', userId: 'u1' },
      ),
    ).toBe(true)
    expect(
      libraryCacheBelongsToSession(
        { serverUrl: 'https://jf', userId: 'u1' },
        { serverUrl: 'https://jf', userId: 'u2' },
      ),
    ).toBe(false)
    expect(
      libraryCacheBelongsToSession(
        { serverUrl: 'https://a', userId: 'u1' },
        { serverUrl: 'https://b', userId: 'u1' },
      ),
    ).toBe(false)
  })
})
