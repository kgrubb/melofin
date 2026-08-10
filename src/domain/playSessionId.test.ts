import { afterEach, describe, expect, it, vi } from 'vitest'
import { newPlaySessionId } from '@/src/domain/playSessionId'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newPlaySessionId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a UUID-shaped id', () => {
    expect(newPlaySessionId()).toMatch(UUID_RE)
  })

  it('returns distinct values', () => {
    expect(newPlaySessionId()).not.toBe(newPlaySessionId())
  })

  it('falls back when crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', undefined)
    expect(newPlaySessionId()).toMatch(UUID_RE)
    expect(newPlaySessionId()).not.toBe(newPlaySessionId())
  })
})
