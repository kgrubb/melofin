import { describe, expect, it } from 'vitest'
import { browseTileColor, BROWSE_TILE_COLORS, hexToRgba, pairItems } from '@/src/domain/browseTile'

describe('browseTileColor', () => {
  it('returns a palette color stably for a seed', () => {
    const a = browseTileColor('Jazz')
    expect(BROWSE_TILE_COLORS).toContain(a)
    expect(browseTileColor('Jazz')).toBe(a)
    expect(browseTileColor('  jazz ')).toBe(a)
    expect(browseTileColor('   ')).toBe(browseTileColor('browse'))
  })

  it('is not constant across seeds', () => {
    const unique = new Set(
      ['Jazz', 'Metal', 'Pop', 'Folk', 'Blues', 'Opera'].map(browseTileColor),
    )
    expect(unique.size).toBeGreaterThan(1)
  })

  it('converts hex to rgba', () => {
    expect(hexToRgba('#D946EF', 0.5)).toBe('rgba(217, 70, 239, 0.5)')
    expect(hexToRgba('22C55E', 2)).toBe('rgba(34, 197, 94, 1)')
    expect(hexToRgba('#0EA5E9', Number.NaN)).toBe('rgba(14, 165, 233, 1)')
  })
})

describe('pairItems', () => {
  it('pairs items and leaves a leftover on the last row', () => {
    expect(pairItems([])).toEqual([])
    expect(pairItems(['a'])).toEqual([['a', undefined]])
    expect(pairItems(['a', 'b', 'c'])).toEqual([
      ['a', 'b'],
      ['c', undefined],
    ])
  })
})
