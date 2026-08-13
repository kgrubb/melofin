import { describe, expect, it } from 'vitest'
import { castError, castErrorMessage, withCastCopy } from '@/src/cast/errors'

describe('cast errors', () => {
  it('maps codes to user copy', () => {
    expect(castErrorMessage('timeout')).toMatch(/timed out/i)
    expect(withCastCopy(castError('auth', 'x')).message).toMatch(/Sign in/i)
  })
})
