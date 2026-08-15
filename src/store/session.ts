import { create } from 'zustand'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  clearSession,
  emptyAccountsState,
  loadAccounts,
  loadSession,
  removeAccountFromState,
  saveAccounts,
  saveSession,
  sessionAccountId,
  type AccountsState,
  type StoredAccount,
  type StoredSession,
} from '@/src/storage/sessionStore'
import { createJellyfinContext } from '@/src/services/jellyfin/client'
import { logger } from '@/src/logging/logger'
import { clearNativeNextQueue } from '@/src/player/nativeQueue'

type SessionState = {
  readonly hydrated: boolean
  readonly session: StoredSession | null
  readonly context: JellyfinContext | null
  readonly accounts: AccountsState
  /** True while Settings → Add server is in the auth stack (AuthGate must not bounce). */
  readonly addingAccount: boolean
  readonly hydrate: () => Promise<void>
  readonly setAuthenticated: (
    session: StoredSession,
    context: JellyfinContext,
  ) => Promise<void>
  readonly beginAddAccount: () => void
  readonly cancelAddAccount: () => void
  readonly switchAccount: (accountId: string) => Promise<boolean>
  readonly removeAccount: (accountId: string) => Promise<void>
  readonly logout: () => Promise<void>
  readonly markUnauthorized: () => Promise<void>
}

const resetPlayback = async () => {
  clearNativeNextQueue()
  const { usePlayerStore } = await import('@/src/store/player')
  usePlayerStore.getState().reset()
}

const activateSession = async (
  session: StoredSession,
  commit: (context: JellyfinContext) => void,
): Promise<JellyfinContext | null> => {
  const context = await createJellyfinContext(
    session.serverUrl,
    session.accessToken,
  )
  if (!context.ok) {
    logger.warn('account activate failed', { server: session.serverUrl })
    return null
  }
  await saveSession(session)
  commit(context.value)
  const { useLibraryStore } = await import('@/src/store/library')
  await useLibraryStore.getState().maybeSyncOnOpen()
  return context.value
}

export const useSessionStore = create<SessionState>((set, get) => ({
  hydrated: false,
  session: null,
  context: null,
  accounts: emptyAccountsState(),
  addingAccount: false,
  hydrate: async () => {
    const [loaded, accounts] = await Promise.all([loadSession(), loadAccounts()])
    const accountState = accounts.ok ? accounts.value : emptyAccountsState()
    if (!loaded.ok || !loaded.value) {
      set({
        hydrated: true,
        session: null,
        context: null,
        accounts: accountState,
        addingAccount: false,
      })
      return
    }
    const context = await createJellyfinContext(
      loaded.value.serverUrl,
      loaded.value.accessToken,
    )
    if (!context.ok) {
      logger.warn('session restore failed')
      set({
        hydrated: true,
        session: null,
        context: null,
        accounts: accountState,
        addingAccount: false,
      })
      return
    }
    set({
      hydrated: true,
      session: loaded.value,
      context: context.value,
      accounts: accountState,
      addingAccount: false,
    })
  },
  setAuthenticated: async (session, context) => {
    await saveSession(session)
    const accounts = await loadAccounts()
    set({
      session,
      context,
      hydrated: true,
      accounts: accounts.ok ? accounts.value : get().accounts,
      addingAccount: false,
    })
    const { useSettingsStore } = await import('@/src/store/settings')
    await useSettingsStore
      .getState()
      .activateAccountScope(session.serverUrl, session.userId)
  },
  beginAddAccount: () => {
    set({ addingAccount: true })
  },
  cancelAddAccount: () => {
    set({ addingAccount: false })
  },
  switchAccount: async (accountId) => {
    const target = get().accounts.accounts.find((a) => a.accountId === accountId)
    if (!target) return false
    if (get().session && sessionAccountId(get().session!) === accountId) {
      return true
    }
    await resetPlayback()
    const session: StoredSession = {
      serverUrl: target.serverUrl,
      userId: target.userId,
      accessToken: target.accessToken,
      userName: target.userName,
      serverName: target.serverName,
      allowInsecureHttp: target.allowInsecureHttp,
    }
    const accounts = await loadAccounts()
    const context = await activateSession(session, (ctx) => {
      set({
        session,
        context: ctx,
        accounts: accounts.ok ? accounts.value : get().accounts,
      })
    })
    if (!context) return false
    const { useSettingsStore } = await import('@/src/store/settings')
    await useSettingsStore
      .getState()
      .activateAccountScope(session.serverUrl, session.userId)
    return true
  },
  removeAccount: async (accountId) => {
    const next = removeAccountFromState(get().accounts, accountId)
    await saveAccounts(next)
    if (get().session && sessionAccountId(get().session!) === accountId) {
      await resetPlayback()
      if (next.activeId) {
        const ok = await get().switchAccount(next.activeId)
        if (!ok) {
          await clearSession()
          set({ session: null, context: null, accounts: next })
        }
        return
      }
      await clearSession()
      set({ session: null, context: null, accounts: next })
      return
    }
    set({ accounts: next })
  },
  logout: async () => {
    const current = get().session
    await clearSession()
    let accounts = get().accounts
    if (current) {
      accounts = removeAccountFromState(accounts, sessionAccountId(current))
      await saveAccounts(accounts)
    }
    set({ session: null, context: null, hydrated: true, accounts })
    await resetPlayback()
  },
  markUnauthorized: async () => {
    logger.warn('401 — clearing session')
    await get().logout()
  },
}))

export type { StoredAccount, AccountsState }
