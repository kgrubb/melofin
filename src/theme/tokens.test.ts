import { describe, expect, it } from 'vitest'
import { colors, gradients, motion, scrollUnderChromePad, spacing, typography } from '@/src/theme/tokens'

describe('theme tokens', () => {
  it('exposes brand palette values', () => {
    expect(colors.accent).toBe('#D946EF')
    expect(gradients.brand[0]).toBe('#9333EA')
    expect(spacing.md).toBe(16)
    expect(typography.title.fontWeight).toBe('700')
  })

  it('has motion spring/duration values', () => {
    expect(motion.scale.button).toBe(0.97)
    expect(motion.scale.card).toBe(0.985)
    expect(motion.duration.ui).toBe(240)
    expect(motion.spring.sheet.damping).toBe(26)
    expect(motion.sheet.dismissDistance).toBe(280)
    expect(motion.sheet.dismissProgress).toBe(0.82)
  })

  it('pads scroll content under floating chrome', () => {
    expect(scrollUnderChromePad(0)).toBeGreaterThan(140)
    expect(scrollUnderChromePad(34)).toBeGreaterThan(scrollUnderChromePad(0))
    expect(scrollUnderChromePad(0, { tabBar: false })).toBeLessThan(scrollUnderChromePad(0))
  })
})
