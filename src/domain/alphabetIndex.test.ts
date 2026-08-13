import { describe, expect, it } from 'vitest'
import {
  ALPHABET_INDEX_LETTERS,
  alphabetIndexFromRelativeScrub,
  alphabetIndexFromY,
  alphabetIndexLetter,
  buildAlphabetIndex,
} from '@/src/domain/alphabetIndex'

describe('alphabetIndexLetter', () => {
  it('maps letters and buckets non-letters under #', () => {
    expect(alphabetIndexLetter('Radiohead')).toBe('R')
    expect(alphabetIndexLetter('  beach house')).toBe('B')
    expect(alphabetIndexLetter('99 Problems')).toBe('#')
    expect(alphabetIndexLetter('')).toBe('#')
  })
})

describe('buildAlphabetIndex', () => {
  it('records the first index for each letter', () => {
    expect(
      buildAlphabetIndex([
        { name: 'Abba' },
        { name: 'AC/DC' },
        { name: 'Beatles' },
        { name: '9Inch' },
        { name: 'Zebra' },
      ]),
    ).toEqual({ A: 0, B: 2, Z: 4, '#': 3 })
  })
})

describe('alphabet scrub math', () => {
  const count = ALPHABET_INDEX_LETTERS.length

  it('maps absolute Y into bands', () => {
    expect(alphabetIndexFromY(0, 270, count)).toBe(0)
    expect(alphabetIndexFromY(269, 270, count)).toBe(count - 1)
  })

  it('steps relatively from the touch anchor', () => {
    const height = count * 10
    expect(alphabetIndexFromRelativeScrub(12, 100, 104, height, count)).toBe(12)
    expect(alphabetIndexFromRelativeScrub(12, 100, 115, height, count)).toBe(14)
    expect(alphabetIndexFromRelativeScrub(0, 0, -100, height, count)).toBe(0)
  })
})
