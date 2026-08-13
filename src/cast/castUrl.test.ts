import { describe, expect, it } from 'vitest'
import { castableUrl } from '@/src/cast/castUrl'

describe('castableUrl', () => {
  it('accepts http(s)', () => {
    expect(castableUrl('https://server/Audio/1').ok).toBe(true)
    expect(castableUrl('http://192.168.1.2/a').ok).toBe(true)
  })

  it('rejects file and empty', () => {
    const file = castableUrl('file:///tmp/a.mp3')
    expect(file.ok).toBe(false)
    if (!file.ok) expect(file.error.code).toBe('offline_track')
    expect(castableUrl('').ok).toBe(false)
    expect(castableUrl('ftp://x').ok).toBe(false)
  })
})
