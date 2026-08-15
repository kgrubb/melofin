import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  emptyAccountsState,
  removeAccountFromState,
  sessionAccountId,
  upsertAccount,
  type AccountsState,
  type StoredAccount,
} from '@/src/domain/accounts'
import { appError, err, ok, type Result } from '@/src/domain/result'

const DEVICE_ID_KEY = 'melio.deviceId'
const SESSION_KEY = 'melio.session'
const ACCOUNTS_KEY = 'melio.accounts'

export type StoredSession = {
  readonly serverUrl: string
  readonly userId: string
  readonly accessToken: string
  readonly userName: string
  readonly serverName: string
  readonly allowInsecureHttp: boolean
}

export type { AccountsState, StoredAccount }
export {
  emptyAccountsState,
  removeAccountFromState,
  sessionAccountId,
  upsertAccount,
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

const readKey = async (key: string): Promise<string | null> => {
  if (isWebStorage()) return webGet(key)
  return SecureStore.getItemAsync(key)
}

const writeKey = async (key: string, value: string): Promise<void> => {
  if (isWebStorage()) {
    webSet(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

const deleteKey = async (key: string): Promise<void> => {
  if (isWebStorage()) {
    webRemove(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

export const getOrCreateDeviceId = async (): Promise<Result<string>> => {
  try {
    const existing = await readKey(DEVICE_ID_KEY)
    if (existing) return ok(existing)
    const deviceId = makeId()
    await writeKey(DEVICE_ID_KEY, deviceId)
    return ok(deviceId)
  } catch (cause) {
    const fallback = memory.get(DEVICE_ID_KEY) ?? makeId()
    memory.set(DEVICE_ID_KEY, fallback)
    if (fallback) return ok(fallback)
    return err(appError('storage', 'Unable to persist device id', cause))
  }
}

export const loadAccounts = async (): Promise<Result<AccountsState>> => {
  try {
    const raw = await readKey(ACCOUNTS_KEY)
    if (!raw) {
      const legacy = await loadSession()
      if (legacy.ok && legacy.value) {
        const migrated = upsertAccount(emptyAccountsState(), legacy.value)
        await saveAccounts(migrated)
        return ok(migrated)
      }
      return ok(emptyAccountsState())
    }
    const parsed = JSON.parse(raw) as AccountsState
    if (!parsed || !Array.isArray(parsed.accounts)) {
      return ok(emptyAccountsState())
    }
    return ok({
      activeId: parsed.activeId ?? null,
      accounts: parsed.accounts,
    })
  } catch (cause) {
    return err(appError('storage', 'Unable to load accounts', cause))
  }
}

export const saveAccounts = async (
  state: AccountsState,
): Promise<Result<void>> => {
  try {
    await writeKey(ACCOUNTS_KEY, JSON.stringify(state))
    return ok(undefined)
  } catch (cause) {
    return err(appError('storage', 'Unable to save accounts', cause))
  }
}

export const saveSession = async (session: StoredSession): Promise<Result<void>> => {
  try {
    await writeKey(SESSION_KEY, JSON.stringify(session))
    const accounts = await loadAccounts()
    if (accounts.ok) {
      await saveAccounts(upsertAccount(accounts.value, session))
    }
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
    const raw = await readKey(SESSION_KEY)
    if (!raw) return ok(null)
    return ok(JSON.parse(raw) as StoredSession)
  } catch (cause) {
    return err(appError('storage', 'Unable to load session', cause))
  }
}

export const clearSession = async (): Promise<Result<void>> => {
  try {
    await deleteKey(SESSION_KEY)
    return ok(undefined)
  } catch (cause) {
    return err(appError('storage', 'Unable to clear session', cause))
  }
}
