import { describe, expect, it } from 'vitest'
import {
  parseSearchRecents,
  prefixMatchRecents,
  removeSearchRecent,
  SEARCH_RECENTS_CAP,
  searchRecentsPath,
  upsertSearchRecent,
} from '@/src/domain/searchRecents'

describe('searchRecents', () => {
  it('builds a scoped recents path', () => {
    const a = searchRecentsPath('https://a.example', 'u1')
    const b = searchRecentsPath('https://b.example', 'u1')
    expect(a).toMatch(/^search-recents-[\da-f]+:u1\.json$/)
    expect(a).not.toBe(b)
  })

  it('upserts newest first and ignores blanks', () => {
    expect(upsertSearchRecent(['b'], '  ')).toEqual(['b'])
    expect(upsertSearchRecent(['b', 'c'], 'a')).toEqual(['a', 'b', 'c'])
    expect(upsertSearchRecent(['Radiohead', 'b'], 'radiohead')).toEqual([
      'radiohead',
      'b',
    ])
    const same = ['Same'] as const
    expect(upsertSearchRecent(same, 'Same')).toBe(same)
    expect(upsertSearchRecent(['Radiohead'], 'radiohead')).toEqual(['radiohead'])
  })

  it('caps recents', () => {
    const filled = Array.from({ length: SEARCH_RECENTS_CAP }, (_, i) => `t${i}`)
    expect(upsertSearchRecent(filled, 'new')).toEqual(['new', ...filled.slice(0, 4)])
  })

  it('removes a recent by case-insensitive match', () => {
    expect(removeSearchRecent(['A', 'B'], 'a')).toEqual(['B'])
    expect(removeSearchRecent(['A'], '  ')).toEqual(['A'])
    expect(removeSearchRecent(['A'], 'z')).toEqual(['A'])
  })

  it('prefix-matches recents', () => {
    const recents = ['Radiohead', 'R.E.M.', 'Abba']
    expect(prefixMatchRecents(recents, '')).toEqual(recents)
    expect(prefixMatchRecents(recents, '  ra')).toEqual(['Radiohead'])
    expect(prefixMatchRecents(recents, 'r.')).toEqual(['R.E.M.'])
  })

  it('parses persisted terms and drops junk', () => {
    expect(parseSearchRecents(null)).toEqual([])
    expect(parseSearchRecents({ terms: [' a ', '', 3, 'a', 'b'] })).toEqual(['a', 'b'])
    expect(parseSearchRecents({ terms: 'nope' })).toEqual([])
    const tooMany = Array.from({ length: 15 }, (_, i) => `t${i}`)
    expect(parseSearchRecents({ terms: tooMany })).toHaveLength(SEARCH_RECENTS_CAP)
  })
})
