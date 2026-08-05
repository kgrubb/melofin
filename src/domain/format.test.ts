import { describe, expect, it } from 'vitest'
import { formatCollectionDuration } from '@/src/domain/format'

describe('formatCollectionDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatCollectionDuration((2 * 3600 + 54 * 60) * 1000)).toBe('2h 54m')
    expect(formatCollectionDuration(42 * 60 * 1000)).toBe('42m')
    expect(formatCollectionDuration(12_000)).toBe('12s')
  })
})
