export const ALPHABET_INDEX_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#',
] as const

export type AlphabetIndexLetter = (typeof ALPHABET_INDEX_LETTERS)[number]
export type AlphabetIndexMap = Readonly<Partial<Record<AlphabetIndexLetter, number>>>

export const alphabetIndexLetter = (name: string): AlphabetIndexLetter => {
  const ch = name.trim().charAt(0).toLocaleUpperCase()
  return ch.length === 1 && ch >= 'A' && ch <= 'Z' ? (ch as AlphabetIndexLetter) : '#'
}

export const buildAlphabetIndex = (
  items: readonly { readonly name: string }[],
): AlphabetIndexMap => {
  const map: Partial<Record<AlphabetIndexLetter, number>> = {}
  for (const [i, item] of items.entries()) {
    const letter = alphabetIndexLetter(item.name)
    if (map[letter] === undefined) map[letter] = i
  }
  return map
}

export const alphabetIndexFromY = (
  y: number,
  height: number,
  letterCount: number,
): number => {
  if (letterCount <= 0 || height <= 0) return 0
  const ratio = Math.min(1, Math.max(0, y / height))
  return Math.min(letterCount - 1, Math.floor(ratio * letterCount))
}

/** Step from the letter under the initial touch by drag distance. */
export const alphabetIndexFromRelativeScrub = (
  startIndex: number,
  startY: number,
  currentY: number,
  height: number,
  letterCount: number,
): number => {
  if (letterCount <= 0) return 0
  const start = Math.min(letterCount - 1, Math.max(0, startIndex))
  if (height <= 0) return start
  const steps = Math.round((currentY - startY) / (height / letterCount))
  return Math.min(letterCount - 1, Math.max(0, start + steps))
}
