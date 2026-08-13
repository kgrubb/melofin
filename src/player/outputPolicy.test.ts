import { describe, expect, it } from 'vitest'
import {
  bindLocalOutputChange,
  isLocalOutputEnabled,
  isMelioScrobbleEnabled,
  setLocalOutputEnabled,
  setMelioScrobbleEnabled,
} from '@/src/player/outputPolicy'

describe('outputPolicy', () => {
  it('toggles local output and notifies listeners', () => {
    setLocalOutputEnabled(true)
    const events: [boolean, boolean][] = []
    bindLocalOutputChange((enabled, wasEnabled) => {
      events.push([enabled, wasEnabled])
    })
    setLocalOutputEnabled(false)
    expect(isLocalOutputEnabled()).toBe(false)
    expect(events).toEqual([[false, true]])
    setLocalOutputEnabled(false)
    expect(events).toHaveLength(1)
    setLocalOutputEnabled(true)
    expect(isLocalOutputEnabled()).toBe(true)
    bindLocalOutputChange(null)
  })

  it('toggles melio scrobble flag', () => {
    setMelioScrobbleEnabled(false)
    expect(isMelioScrobbleEnabled()).toBe(false)
    setMelioScrobbleEnabled(true)
    expect(isMelioScrobbleEnabled()).toBe(true)
  })
})
