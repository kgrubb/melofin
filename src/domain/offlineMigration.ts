import {
  accountScopeKey,
  isLegacyOfflineAudioPath,
  scopedAudioRelativePath,
  type AccountScope,
} from '@/src/domain/accountScope'
import {
  emptyOfflineIndex,
  type OfflineEntry,
  type OfflineIndex,
} from '@/src/domain/offline'

export type LegacyMigrationPlan = {
  readonly shouldMigrate: boolean
  readonly nextIndex: OfflineIndex
  readonly moves: readonly {
    readonly fromPath: string
    readonly toRelative: string
    readonly itemId: string
  }[]
}

/**
 * If legacy unscoped audio matches the current session, rewrite paths into
 * scopes/<scopeKey>/audio/<id>. Mismatch → leave legacy, start empty scoped index.
 */
export const planLegacyOfflineMigration = (input: {
  readonly index: OfflineIndex
  readonly scope: AccountScope
}): LegacyMigrationPlan => {
  const scopeKey = accountScopeKey(input.scope)
  const entries = Object.values(input.index.entries)
  const hasLegacy = entries.some((e) => isLegacyOfflineAudioPath(e.path))
  if (!hasLegacy) {
    return { shouldMigrate: false, nextIndex: input.index, moves: [] }
  }

  const matches =
    (!input.index.serverUrl ||
      input.index.serverUrl === input.scope.serverUrl) &&
    (!input.index.userId || input.index.userId === input.scope.userId)

  if (!matches) {
    return {
      shouldMigrate: false,
      nextIndex: emptyOfflineIndex(input.index.budgetBytes, {
        serverUrl: input.scope.serverUrl,
        userId: input.scope.userId,
      }),
      moves: [],
    }
  }

  const moves: {
    readonly fromPath: string
    readonly toRelative: string
    readonly itemId: string
  }[] = []
  const nextEntries: Record<string, OfflineEntry> = {}
  for (const entry of entries) {
    if (!isLegacyOfflineAudioPath(entry.path)) {
      nextEntries[entry.itemId] = entry
      continue
    }
    const toRelative = scopedAudioRelativePath(scopeKey, entry.itemId)
    moves.push({
      fromPath: entry.path,
      toRelative,
      itemId: entry.itemId,
    })
    nextEntries[entry.itemId] = { ...entry, path: toRelative }
  }

  return {
    shouldMigrate: moves.length > 0,
    nextIndex: {
      ...input.index,
      entries: nextEntries,
      serverUrl: input.scope.serverUrl,
      userId: input.scope.userId,
    },
    moves,
  }
}
