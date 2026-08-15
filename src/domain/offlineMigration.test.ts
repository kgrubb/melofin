import { describe, expect, it } from 'vitest'
import { planLegacyOfflineMigration } from '@/src/domain/offlineMigration'
import { emptyOfflineIndex, upsertEntry } from '@/src/domain/offline'

describe('offlineMigration', () => {
  it('rewrites matching legacy paths into the account scope', () => {
    const index = upsertEntry(emptyOfflineIndex(100, {
      serverUrl: 'https://jf',
      userId: 'u1',
    }), {
      itemId: 't1',
      title: 't',
      artist: 'a',
      album: 'b',
      durationMs: 1,
      path: 'audio/t1',
      sizeBytes: 1,
      downloadedAt: 1,
      lastAccessedAt: 1,
      kind: 'user',
      complete: true,
    })
    const plan = planLegacyOfflineMigration({
      index,
      scope: { serverUrl: 'https://jf', userId: 'u1' },
    })
    expect(plan.shouldMigrate).toBe(true)
    expect(plan.moves).toHaveLength(1)
    expect(plan.nextIndex.entries.t1?.path).toMatch(/^scopes\//)
  })

  it('starts empty scoped index when server mismatches', () => {
    const index = upsertEntry(
      emptyOfflineIndex(100, { serverUrl: 'https://old', userId: 'u1' }),
      {
        itemId: 't1',
        title: 't',
        artist: 'a',
        album: 'b',
        durationMs: 1,
        path: 'audio/t1',
        sizeBytes: 1,
        downloadedAt: 1,
        lastAccessedAt: 1,
        kind: 'user',
        complete: true,
      },
    )
    const plan = planLegacyOfflineMigration({
      index,
      scope: { serverUrl: 'https://new', userId: 'u1' },
    })
    expect(plan.shouldMigrate).toBe(false)
    expect(Object.keys(plan.nextIndex.entries)).toHaveLength(0)
  })

  it('no-ops when there is no legacy audio', () => {
    const plan = planLegacyOfflineMigration({
      index: emptyOfflineIndex(),
      scope: { serverUrl: 'https://jf', userId: 'u1' },
    })
    expect(plan.shouldMigrate).toBe(false)
    expect(plan.moves).toHaveLength(0)
  })
})
