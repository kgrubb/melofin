import { describe, expect, it } from 'vitest'
import { shouldMelofinScrobble, isLocalAudible } from '@/src/cast/scrobblePolicy'

describe('scrobblePolicy', () => {
  it('scrobbles local airplay cast but not jellyfin', () => {
    expect(shouldMelofinScrobble('local')).toBe(true)
    expect(shouldMelofinScrobble('airplay')).toBe(true)
    expect(shouldMelofinScrobble('chromecast')).toBe(true)
    expect(shouldMelofinScrobble('jellyfin')).toBe(false)
  })

  it('marks local and airplay as audible on device', () => {
    expect(isLocalAudible('local')).toBe(true)
    expect(isLocalAudible('airplay')).toBe(true)
    expect(isLocalAudible('chromecast')).toBe(false)
    expect(isLocalAudible('jellyfin')).toBe(false)
  })
})
