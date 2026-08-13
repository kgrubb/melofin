import { describe, expect, it } from 'vitest'
import { shouldMelioScrobble, isLocalAudible } from '@/src/cast/scrobblePolicy'

describe('scrobblePolicy', () => {
  it('scrobbles local airplay cast but not jellyfin', () => {
    expect(shouldMelioScrobble('local')).toBe(true)
    expect(shouldMelioScrobble('airplay')).toBe(true)
    expect(shouldMelioScrobble('chromecast')).toBe(true)
    expect(shouldMelioScrobble('jellyfin')).toBe(false)
  })

  it('marks local and airplay as audible on device', () => {
    expect(isLocalAudible('local')).toBe(true)
    expect(isLocalAudible('airplay')).toBe(true)
    expect(isLocalAudible('chromecast')).toBe(false)
    expect(isLocalAudible('jellyfin')).toBe(false)
  })
})
