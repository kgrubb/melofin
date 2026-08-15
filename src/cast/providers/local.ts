import { Platform } from 'react-native'
import type { CastDevice, CastProvider, CastStatus } from '@/src/cast/types'
import { LOCAL_DEVICE_ID } from '@/src/cast/types'
import { ok } from '@/src/domain/result'
import { localDeviceName } from '@/src/cast/snapshot'
import {
  setLocalOutputEnabled,
  setMelioScrobbleEnabled,
} from '@/src/player/outputPolicy'

const listeners = new Set<(devices: readonly CastDevice[]) => void>()

const emit = () => {
  const device: CastDevice = {
    id: LOCAL_DEVICE_ID,
    name: localDeviceName(),
    kind: 'local',
    subtitle: 'This device',
  }
  listeners.forEach((cb) => cb([device]))
}

export const localProvider: CastProvider = {
  subscribeDevices: (cb) => {
    listeners.add(cb)
    cb([
      {
        id: LOCAL_DEVICE_ID,
        name: localDeviceName(),
        kind: 'local',
        subtitle: 'This device',
      },
    ])
    return () => {
      listeners.delete(cb)
    }
  },
  connect: async () => {
    setLocalOutputEnabled(true)
    setMelioScrobbleEnabled(true)
    emit()
    return ok(undefined)
  },
  disconnect: async () => ok(undefined),
  play: async () => ok(undefined),
  pause: async () => ok(undefined),
  seek: async () => ok(undefined),
  next: async () => ok(undefined),
  previous: async () => ok(undefined),
  syncTo: async () => ok(undefined),
  subscribeStatus: (cb) => {
    const tick = () => {
      // Local status comes from playlistEngine / player store. No-op pump.
      const status: CastStatus = {
        playing: false,
        positionMs: 0,
        buffering: false,
        ended: false,
      }
      cb(status)
    }
    if (Platform.OS === 'web') tick()
    return () => undefined
  },
}
