import { describe, expect, it } from 'vitest'
import {
  acceptReportedPosition,
  beginSeekGuard,
  idleSeekGuard,
} from '@/src/domain/seekPosition'

describe('seekPosition guard', () => {
  it('begins with a target and settle window', () => {
    expect(beginSeekGuard(60_000, 1000, 2000)).toEqual({
      targetMs: 60_000,
      until: 3000,
      retries: 0,
    })
  })

  it('rejects stale pre-seek reports until close', () => {
    const guard = beginSeekGuard(60_000, 0, 2000)

    expect(acceptReportedPosition(guard, 12_000, 60_000, 100)).toEqual({
      accept: false,
      positionMs: 60_000,
      guard,
      retrySeek: false,
    })

    expect(acceptReportedPosition(guard, 59_500, 60_000, 100)).toEqual({
      accept: true,
      positionMs: 59_500,
      guard: idleSeekGuard(),
      retrySeek: false,
    })
  })

  it('on timeout keeps the scrub target and retries instead of snapping back', () => {
    const guard = beginSeekGuard(30_000, 0, 2000)
    const decision = acceptReportedPosition(guard, 120_000, 30_000, 2500)

    expect(decision.accept).toBe(true)
    expect(decision.positionMs).toBe(30_000)
    expect(decision.retrySeek).toBe(true)
    expect(decision.guard.targetMs).toBe(30_000)
    expect(decision.guard.retries).toBe(1)
  })

  it('stops retrying after max attempts but still keeps the target', () => {
    const guard = beginSeekGuard(30_000, 0, 2000, 3)
    const decision = acceptReportedPosition(guard, 120_000, 30_000, 2500)

    expect(decision).toEqual({
      accept: true,
      positionMs: 30_000,
      guard: idleSeekGuard(),
      retrySeek: false,
    })
  })

  it('rejects spurious zero while far into a track', () => {
    expect(acceptReportedPosition(idleSeekGuard(), 0, 8000, 0).accept).toBe(false)
    expect(acceptReportedPosition(idleSeekGuard(), 0, 500, 0).accept).toBe(true)
  })
})
