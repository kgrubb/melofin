import { describe, expect, it } from 'vitest'
import {
  isSleepArmed,
  remainingMs,
  shouldFireDeadline,
  sleepEndOfTrack,
  sleepOff,
  sleepUntil,
} from '@/src/domain/sleepTimer'

describe('sleepTimer', () => {
  it('tracks deadline remaining and fire', () => {
    const armed = sleepUntil(1000)
    expect(remainingMs(armed, 400)).toBe(600)
    expect(shouldFireDeadline(armed, 999)).toBe(false)
    expect(shouldFireDeadline(armed, 1000)).toBe(true)
    expect(isSleepArmed(armed)).toBe(true)
  })

  it('supports end-of-track and off', () => {
    expect(isSleepArmed(sleepEndOfTrack())).toBe(true)
    expect(shouldFireDeadline(sleepEndOfTrack(), 99999)).toBe(false)
    expect(isSleepArmed(sleepOff())).toBe(false)
    expect(remainingMs(sleepOff(), 50)).toBe(0)
    expect(isSleepArmed(sleepUntil(1))).toBe(true)
  })
})
