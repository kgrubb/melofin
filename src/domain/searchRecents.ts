import { accountScopeKey } from '@/src/domain/accountScope'

export const SEARCH_RECENTS_CAP = 5

export const normalizeSearchTerm = (raw: string): string => raw.trim()

export const searchRecentsPath = (serverUrl: string, userId: string): string =>
  `search-recents-${accountScopeKey({ serverUrl, userId })}.json`

export const upsertSearchRecent = (
  recents: readonly string[],
  raw: string,
  cap = SEARCH_RECENTS_CAP,
): readonly string[] => {
  const term = normalizeSearchTerm(raw)
  if (!term) return recents
  const key = term.toLowerCase()
  if (recents[0]?.toLowerCase() === key) {
    return recents[0] === term ? recents : [term, ...recents.slice(1)]
  }
  const rest = recents.filter((entry) => entry.toLowerCase() !== key)
  return [term, ...rest].slice(0, cap)
}

export const removeSearchRecent = (
  recents: readonly string[],
  raw: string,
): readonly string[] => {
  const key = normalizeSearchTerm(raw).toLowerCase()
  if (!key) return recents
  return recents.filter((entry) => entry.toLowerCase() !== key)
}

export const prefixMatchRecents = (
  recents: readonly string[],
  raw: string,
): readonly string[] => {
  const needle = normalizeSearchTerm(raw).toLowerCase()
  if (!needle) return recents
  return recents.filter((entry) => entry.toLowerCase().startsWith(needle))
}

export const parseSearchRecents = (value: unknown): readonly string[] => {
  if (!value || typeof value !== 'object') return []
  const terms = (value as { readonly terms?: unknown }).terms
  if (!Array.isArray(terms)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of terms) {
    if (typeof entry !== 'string') continue
    const term = normalizeSearchTerm(entry)
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length >= SEARCH_RECENTS_CAP) break
  }
  return out
}
