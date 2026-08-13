import { describe, expect, it } from 'vitest'
import {
  isLocalDeviceId,
  shouldBlockRemoteTransfer,
  shouldIgnoreDuplicateTransfer,
  shouldSyncRemotePlayback,
} from '@/src/cast/transferPlan'
import { beginTransfer, idleTransfer } from '@/src/cast/transferMachine'
import { LOCAL_DEVICE_ID } from '@/src/cast/types'

describe('transferPlan', () => {
  it('blocks chromecast and jellyfin when offline', () => {
    expect(shouldBlockRemoteTransfer(false, 'cast:abc')).toBe(true)
    expect(shouldBlockRemoteTransfer(false, 'jellyfin:x')).toBe(true)
    expect(shouldBlockRemoteTransfer(false, LOCAL_DEVICE_ID)).toBe(false)
    expect(shouldBlockRemoteTransfer(true, 'cast:abc')).toBe(false)
  })

  it('detects local device id', () => {
    expect(isLocalDeviceId(LOCAL_DEVICE_ID)).toBe(true)
    expect(isLocalDeviceId('cast:1')).toBe(false)
  })

  it('ignores duplicate transferring state', () => {
    const idle = idleTransfer('Phone')
    const next = beginTransfer(idle, 'cast:1', 1)
    expect(shouldIgnoreDuplicateTransfer(next, next)).toBe(true)
    expect(shouldIgnoreDuplicateTransfer(idle, next)).toBe(false)
  })

  it('syncs remote on playing identity or queue-shape change', () => {
    expect(
      shouldSyncRemotePlayback({
        applyingRemote: false,
        localAudible: false,
        prevKey: 'a',
        nextKey: 'b',
      }),
    ).toBe(true)
    expect(
      shouldSyncRemotePlayback({
        applyingRemote: true,
        localAudible: false,
        prevKey: 'a',
        nextKey: 'b',
      }),
    ).toBe(false)
    expect(
      shouldSyncRemotePlayback({
        applyingRemote: false,
        localAudible: true,
        prevKey: 'a',
        nextKey: 'b',
      }),
    ).toBe(false)
    expect(
      shouldSyncRemotePlayback({
        applyingRemote: false,
        localAudible: false,
        prevKey: 'a',
        nextKey: 'a',
      }),
    ).toBe(false)
    expect(
      shouldSyncRemotePlayback({
        applyingRemote: false,
        localAudible: false,
        prevKey: 'a',
        nextKey: 'a',
        queueChanged: true,
      }),
    ).toBe(true)
  })
})
