import { describe, expect, it } from 'vitest'
import {
  homeGreeting,
  homeGreetingPeriod,
  msUntilNextHomeGreeting,
} from '@/src/domain/homeGreeting'

describe('homeGreetingPeriod', () => {
  it('returns morning, afternoon, and evening by local hour', () => {
    expect(homeGreetingPeriod(new Date(2026, 0, 1, 5, 0, 0))).toBe('morning')
    expect(homeGreetingPeriod(new Date(2026, 0, 1, 11, 59, 0))).toBe('morning')
    expect(homeGreetingPeriod(new Date(2026, 0, 1, 12, 0, 0))).toBe('afternoon')
    expect(homeGreetingPeriod(new Date(2026, 0, 1, 16, 59, 0))).toBe('afternoon')
    expect(homeGreetingPeriod(new Date(2026, 0, 1, 17, 0, 0))).toBe('evening')
    expect(homeGreetingPeriod(new Date(2026, 0, 1, 4, 59, 0))).toBe('evening')
  })
})

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
