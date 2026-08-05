import { describe, expect, it, vi } from 'vitest'
import { createLogger, redactFields, redactValue } from '@/src/logging/logger'

describe('logger redaction', () => {
  it('redacts secrets recursively', () => {
    expect(redactFields({ Authorization: 'secret', title: 'ok' })).toEqual({
      Authorization: '[REDACTED]',
      title: 'ok',
    })
    expect(redactValue('nested', { password: 'x', ok: 1 })).toEqual({
      password: '[REDACTED]',
      ok: 1,
    })
    expect(redactValue('list', [{ token: 'a' }])).toEqual([{ token: '[REDACTED]' }])
  })

  it('writes through sink for all levels', () => {
    const lines: string[] = []
    const log = createLogger((level, message) => {
      lines.push(`${level}:${message}`)
    })
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(lines).toEqual(['debug:d', 'info:i', 'warn:w', 'error:e'])
  })

  it('uses console sinks by default', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const log = createLogger()
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(spy).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    spy.mockRestore()
    warn.mockRestore()
    error.mockRestore()
  })
})
