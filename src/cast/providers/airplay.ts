import { Platform } from 'react-native'
import type { CastDevice, CastProvider } from '@/src/cast/types'
import { ok } from '@/src/domain/result'

type RouteListener = (routeName: string | null) => void

const routeListeners = new Set<RouteListener>()
const deviceListeners = new Set<(devices: readonly CastDevice[]) => void>()

type AirPlayRouteState = {
  readonly currentRoute: string | null
}

let state: AirPlayRouteState = {
  currentRoute: null,
}

export const notifyAirPlayRoute = (routeName: string | null): void => {
  if (Platform.OS !== 'ios') return
  state = { currentRoute: routeName }
  routeListeners.forEach((cb) => cb(routeName))
  const devices: CastDevice[] = routeName
    ? [{ id: 'airplay', name: routeName, kind: 'airplay', subtitle: 'AirPlay' }]
    : []
  deviceListeners.forEach((cb) => cb(devices))
}

export const subscribeAirPlayRoute = (cb: RouteListener): (() => void) => {
  routeListeners.add(cb)
  cb(state.currentRoute)
  return () => {
    routeListeners.delete(cb)
  }
}

export const airplayProvider: CastProvider = {
  subscribeDevices: (cb) => {
    if (Platform.OS !== 'ios') {
      cb([])
      return () => undefined
    }
    deviceListeners.add(cb)
    cb(
      state.currentRoute
        ? [
            {
              id: 'airplay',
              name: state.currentRoute,
              kind: 'airplay',
              subtitle: 'AirPlay',
            },
          ]
        : [],
    )
    return () => {
      deviceListeners.delete(cb)
    }
  },
  connect: async () => ok(undefined),
  disconnect: async () => ok(undefined),
  play: async () => ok(undefined),
  pause: async () => ok(undefined),
  seek: async () => ok(undefined),
  next: async () => ok(undefined),
  previous: async () => ok(undefined),
  syncTo: async () => ok(undefined),
  subscribeStatus: () => () => undefined,
}
