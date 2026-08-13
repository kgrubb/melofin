import { describe, expect, it } from 'vitest'
import {
  beginTransfer,
  cancelTransfer,
  completeTransfer,
  failTransfer,
  idleTransfer,
  isTransferTimedOut,
  localOutput,
  sessionLost,
  setAirPlayRoute,
} from '@/src/cast/transferMachine'
import { castError } from '@/src/cast/errors'
import { TRANSFER_TIMEOUT_MS } from '@/src/cast/types'

describe('transferMachine', () => {
  it('starts idle on local', () => {
    const s = idleTransfer('iPhone')
    expect(s.phase).toBe('idle')
    expect(s.active.kind).toBe('local')
  })

  it('begins and completes transfer', () => {
    const mid = beginTransfer(idleTransfer(), 'cast:1', 1000)
    expect(mid.phase).toBe('transferring')
    expect(mid.targetId).toBe('cast:1')
    const done = completeTransfer(mid, {
      deviceId: 'cast:1',
      kind: 'chromecast',
      name: 'Nest',
    })
    expect(done.phase).toBe('connected')
    expect(done.active.name).toBe('Nest')
  })

  it('ignores duplicate begin while transferring', () => {
    const mid = beginTransfer(idleTransfer(), 'a', 1)
    expect(beginTransfer(mid, 'b', 2)).toBe(mid)
  })

  it('cancels back to previous', () => {
    const mid = beginTransfer(idleTransfer(), 'cast:1', 1)
    const cancelled = cancelTransfer(mid)
    expect(cancelled.active.kind).toBe('local')
    expect(cancelled.phase).toBe('idle')
  })

  it('fails to fallback and times out', () => {
    const mid = beginTransfer(idleTransfer(), 'cast:1', 100)
    const failed = failTransfer(mid, castError('timeout', 't'))
    expect(failed.phase).toBe('failed')
    expect(failed.active.kind).toBe('local')
    expect(isTransferTimedOut(mid, 100 + TRANSFER_TIMEOUT_MS, TRANSFER_TIMEOUT_MS)).toBe(
      true,
    )
    expect(isTransferTimedOut(mid, 150, TRANSFER_TIMEOUT_MS)).toBe(false)
  })

  it('session loss returns local paused-ready idle', () => {
    const connected = completeTransfer(idleTransfer(), {
      deviceId: 'j:1',
      kind: 'jellyfin',
      name: 'TV',
    })
    expect(sessionLost(connected, 'Phone').active.kind).toBe('local')
  })

  it('airplay route updates only when not remote-casting', () => {
    const routed = setAirPlayRoute(idleTransfer(), 'HomePod')
    expect(routed.active.kind).toBe('airplay')
    expect(setAirPlayRoute(routed, null).active.kind).toBe('local')

    const casted = completeTransfer(idleTransfer(), {
      deviceId: 'c',
      kind: 'chromecast',
      name: 'Cast',
    })
    expect(setAirPlayRoute(casted, 'HomePod').active.kind).toBe('chromecast')
  })

  it('complete to local is idle', () => {
    expect(completeTransfer(idleTransfer(), localOutput()).phase).toBe('idle')
  })
})
