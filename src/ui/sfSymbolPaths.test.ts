import { describe, expect, it } from 'vitest'
import { SF_SYMBOL_PATHS } from '@/src/ui/sfSymbolPaths'

/** Chrome that shows up in README / store screenshots. */
const SCREENSHOT_ICONS = [
  'shuffle',
  'heart',
  'heart.fill',
  'house',
  'house.fill',
  'magnifyingglass',
  'rectangle.stack',
  'rectangle.stack.fill',
  'arrow.down.circle',
  'arrow.down.circle.fill',
  'moon.zzz',
  'infinity',
  'repeat',
  'speaker.wave.2.fill',
  'backward.fill',
  'forward.fill',
] as const

const subpathBounds = (d: string) =>
  d
    .split('M')
    .filter((part) => part.trim())
    .map((part) => {
      const nums = [...part.matchAll(/[-+]?(?:\d+\.\d*|\.\d+|\d+)/g)].map((m) => Number(m[0]))
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      return {
        midX: (Math.min(...xs) + Math.max(...xs)) / 2,
        midY: (Math.min(...ys) + Math.max(...ys)) / 2,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      }
    })

describe('SF_SYMBOL_PATHS', () => {
  it('includes the SF Symbols used on web chrome', () => {
    for (const name of SCREENSHOT_ICONS) {
      expect(SF_SYMBOL_PATHS[name]?.d.length).toBeGreaterThan(10)
    }
  })

  it('traces rectangle.stack from the flattened SF bitmap so card gaps stay intact', () => {
    const outline = SF_SYMBOL_PATHS['rectangle.stack']
    expect(outline?.evenOdd).toBe(true)
    expect((outline?.d ?? '').split('M').length - 1).toBeGreaterThanOrEqual(3)

    const filled = SF_SYMBOL_PATHS['rectangle.stack.fill']
    expect(filled?.evenOdd).toBe(true)
    expect((filled?.d ?? '').split('M').length - 1).toBeGreaterThanOrEqual(3)
  })

  it('keeps knockout glyphs centered inside filled circles', () => {
    const glyph = SF_SYMBOL_PATHS['arrow.down.circle.fill']
    expect(glyph?.evenOdd).toBe(true)
    const bounds = subpathBounds(glyph?.d ?? '')
    expect(bounds.length).toBeGreaterThanOrEqual(2)
    const circle = bounds.reduce((largest, next) => (next.width > largest.width ? next : largest))
    const arrow = bounds.find((part) => part !== circle)
    expect(arrow).toBeDefined()
    expect(arrow!.width).toBeLessThan(circle.width)
    expect(Math.abs(arrow!.midX - circle.midX)).toBeLessThan(circle.width * 0.06)
    expect(Math.abs(arrow!.midY - circle.midY)).toBeLessThan(circle.height * 0.06)
  })
})
