import { describe, expect, it } from 'vitest'
import {
  bindLocalOutputChange,
  isLocalOutputEnabled,
  isMelofinScrobbleEnabled,
  setLocalOutputEnabled,
  setMelofinScrobbleEnabled,
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

  it('toggles melofin scrobble flag', () => {
    setMelofinScrobbleEnabled(false)
    expect(isMelofinScrobbleEnabled()).toBe(false)
    setMelofinScrobbleEnabled(true)
    expect(isMelofinScrobbleEnabled()).toBe(true)
  })
})
