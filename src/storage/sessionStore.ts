import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { appError, err, ok, type Result } from '@/src/domain/result'

const DEVICE_ID_KEY = 'melio.deviceId'
const SESSION_KEY = 'melio.session'

export type StoredSession = {
  readonly serverUrl: string
  readonly userId: string
  readonly accessToken: string
  readonly userName: string
  readonly serverName: string
  readonly allowInsecureHttp: boolean
}

const memory = new Map<string, string>()

const makeId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return `melio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const webGet = (key: string): string | null => {
  try {
    if (typeof localStorage !== 'undefined') {
      const value = localStorage.getItem(key)
      if (value != null) {
        memory.set(key, value)
        return value
      }
    }
  } catch {
    // private mode / blocked storage
  }
  return memory.get(key) ?? null
}

const webSet = (key: string, value: string): void => {
  memory.set(key, value)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
    }
  } catch {
    // memory-only is enough for browser preview / Quick Connect
  }
}

const webRemove = (key: string): void => {
  memory.delete(key)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

const isWebStorage = (): boolean => Platform.OS === 'web'

export const getOrCreateDeviceId = async (): Promise<Result<string>> => {
  try {
    if (isWebStorage()) {
      const existing = webGet(DEVICE_ID_KEY)
      if (existing) return ok(existing)
      const deviceId = makeId()
      webSet(DEVICE_ID_KEY, deviceId)
      return ok(deviceId)
    }

    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY)
    if (existing) return ok(existing)
    const deviceId = makeId()
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId)
    return ok(deviceId)
  } catch (cause) {
    // Last resort so auth never dies on storage quirks during preview.
    const fallback = memory.get(DEVICE_ID_KEY) ?? makeId()
    memory.set(DEVICE_ID_KEY, fallback)
    if (fallback) return ok(fallback)
    return err(appError('storage', 'Unable to persist device id', cause))
  }
}

export const saveSession = async (session: StoredSession): Promise<Result<void>> => {
  try {
    const raw = JSON.stringify(session)
    if (isWebStorage()) {
      webSet(SESSION_KEY, raw)
      return ok(undefined)
    }
    await SecureStore.setItemAsync(SESSION_KEY, raw)
    return ok(undefined)
  } catch (cause) {
    if (isWebStorage()) {
      memory.set(SESSION_KEY, JSON.stringify(session))
      return ok(undefined)
    }
    return err(appError('storage', 'Unable to save session', cause))
  }
}

export const loadSession = async (): Promise<Result<StoredSession | null>> => {
  try {
    const raw = isWebStorage()
      ? webGet(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY)
    if (!raw) return ok(null)
    return ok(JSON.parse(raw) as StoredSession)
  } catch (cause) {
    return err(appError('storage', 'Unable to load session', cause))
  }
}

export const clearSession = async (): Promise<Result<void>> => {
  try {
    if (isWebStorage()) {
      webRemove(SESSION_KEY)
      return ok(undefined)
    }
    await SecureStore.deleteItemAsync(SESSION_KEY)
    return ok(undefined)
  } catch (cause) {
    return err(appError('storage', 'Unable to clear session', cause))
  }
}
