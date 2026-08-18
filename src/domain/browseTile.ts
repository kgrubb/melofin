import { stableHash } from '@/src/domain/accountScope'

/** Saturated Melio palette — not Spotify category greens/navy. */
export const BROWSE_TILE_COLORS = [
  '#D946EF',
  '#9333EA',
  '#FB7185',
  '#F97316',
  '#06B6D4',
  '#22C55E',
  '#A855F7',
  '#E11D48',
  '#F59E0B',
  '#0EA5E9',
  '#C026D3',
  '#EF4444',
  '#14B8A6',
  '#8B5CF6',
  '#F43F5E',
  '#6366F1',
] as const

export const hexToRgba = (hex: string, alpha: number): string => {
  const raw = hex.trim().replace('#', '')
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export const browseTileColor = (seed: string): string => {
  const key = seed.trim().toLowerCase() || 'browse'
  const index = Number.parseInt(stableHash(key).slice(0, 8), 16) % BROWSE_TILE_COLORS.length
  return BROWSE_TILE_COLORS[index] ?? BROWSE_TILE_COLORS[0]
}

export const pairItems = <T>(items: readonly T[]): readonly (readonly [T, T | undefined])[] => {
  const rows: (readonly [T, T | undefined])[] = []
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i]!, items[i + 1]])
  }
  return rows
}
