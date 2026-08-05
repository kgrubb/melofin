import { describe, expect, it } from 'vitest'
import {
  isInsecureHttpUrl,
  msToTicks,
  normalizeServerUrl,
  positionTicksSatisfiesListen,
  ticksToMs,
} from '@/src/domain/jellyfin'

describe('normalizeServerUrl', () => {
  it('requires a value', () => {
    expect(normalizeServerUrl('').ok).toBe(false)
    expect(normalizeServerUrl('   ').ok).toBe(false)
  })

  it('adds https by default and http when preferred', () => {
    const https = normalizeServerUrl('jellyfin.local')
    expect(https.ok && https.value).toBe('https://jellyfin.local')
    const http = normalizeServerUrl('jellyfin.local', { preferScheme: 'http' })
    expect(http.ok && http.value).toBe('http://jellyfin.local')
  })

  it('keeps http when provided', () => {
    const result = normalizeServerUrl('http://192.168.1.10:8096')
    expect(result.ok && result.value).toBe('http://192.168.1.10:8096')
    expect(isInsecureHttpUrl('http://192.168.1.10:8096')).toBe(true)
    expect(isInsecureHttpUrl('https://secure.example')).toBe(false)
  })

  it('strips trailing slash', () => {
    const result = normalizeServerUrl('https://example.com/jellyfin/')
    expect(result.ok && result.value).toBe('https://example.com/jellyfin')
  })

  it('rejects invalid urls and schemes', () => {
    expect(normalizeServerUrl('not a url').ok).toBe(false)
    expect(normalizeServerUrl('ftp://example.com').ok).toBe(false)
  })
})

describe('ticks helpers', () => {
  it('converts ticks and ms', () => {
    expect(msToTicks(1000)).toBe(10_000_000)
    expect(ticksToMs(10_000_000)).toBe(1000)
  })

  it('satisfies listenbrainz style thresholds', () => {
    expect(positionTicksSatisfiesListen(msToTicks(240_000), msToTicks(300_000))).toBe(true)
    expect(positionTicksSatisfiesListen(msToTicks(90_000), msToTicks(160_000))).toBe(true)
    expect(positionTicksSatisfiesListen(msToTicks(30_000), msToTicks(300_000))).toBe(false)
  })
})
