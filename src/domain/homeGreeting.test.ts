import { describe, expect, it } from 'vitest'
import { homeGreeting, msUntilNextHomeGreeting } from '@/src/domain/homeGreeting'

describe('homeGreeting', () => {
  it('returns morning, afternoon, and evening by local hour', () => {
    expect(homeGreeting(new Date(2026, 0, 1, 5, 0, 0))).toBe('Good morning')
    expect(homeGreeting(new Date(2026, 0, 1, 11, 59, 0))).toBe('Good morning')
    expect(homeGreeting(new Date(2026, 0, 1, 12, 0, 0))).toBe('Good afternoon')
    expect(homeGreeting(new Date(2026, 0, 1, 16, 59, 0))).toBe('Good afternoon')
    expect(homeGreeting(new Date(2026, 0, 1, 17, 0, 0))).toBe('Good evening')
    expect(homeGreeting(new Date(2026, 0, 1, 4, 59, 0))).toBe('Good evening')
  })

  it('counts ms until the next greeting breakpoint', () => {
    expect(msUntilNextHomeGreeting(new Date(2026, 0, 1, 11, 0, 0))).toBe(60 * 60 * 1000)
    expect(msUntilNextHomeGreeting(new Date(2026, 0, 1, 16, 59, 0))).toBe(60 * 1000)
    expect(msUntilNextHomeGreeting(new Date(2026, 0, 1, 4, 0, 0))).toBe(60 * 60 * 1000)
    expect(msUntilNextHomeGreeting(new Date(2026, 0, 1, 17, 0, 0))).toBe(12 * 60 * 60 * 1000)
    expect(msUntilNextHomeGreeting(new Date(2026, 0, 1, 12, 0, 0))).toBe(5 * 60 * 60 * 1000)
  })
})
