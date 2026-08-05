import { describe, expect, it } from 'vitest'
import { appError, err, flatMapResult, isErr, isOk, mapResult, ok } from '@/src/domain/result'

describe('result', () => {
  it('wraps success and failure', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 })
    expect(err(appError('validation', 'bad')).ok).toBe(false)
  })

  it('maps and flatMaps', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual(ok(4))
    expect(mapResult(err(appError('network', 'x')), (n: number) => n * 2).ok).toBe(false)
    expect(flatMapResult(ok(2), (n) => ok(n + 1))).toEqual(ok(3))
    expect(flatMapResult(err(appError('network', 'x')), () => ok(1)).ok).toBe(false)
    expect(appError('validation', 'bad', new Error('cause')).cause).toBeInstanceOf(Error)
    expect(appError('validation', 'bad').cause).toBeUndefined()
  })

  it('narrows with guards', () => {
    const success = ok('a')
    const failure = err(appError('unknown', 'x'))
    expect(isOk(success)).toBe(true)
    expect(isErr(failure)).toBe(true)
  })
})
