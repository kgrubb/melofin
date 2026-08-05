import { create } from 'zustand'
import type { JellyfinContext } from '@/src/services/jellyfin/client'
import {
  clearSession,
  loadSession,
  saveSession,
  type StoredSession,
} from '@/src/storage/sessionStore'
import { createJellyfinContext } from '@/src/services/jellyfin/client'
import { logger } from '@/src/logging/logger'

type SessionState = {
  readonly hydrated: boolean
  readonly session: StoredSession | null
  readonly context: JellyfinContext | null
  readonly hydrate: () => Promise<void>
  readonly setAuthenticated: (
    session: StoredSession,
    context: JellyfinContext,
  ) => Promise<void>
  readonly logout: () => Promise<void>
  readonly markUnauthorized: () => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  hydrated: false,
  session: null,
  context: null,
  hydrate: async () => {
    const loaded = await loadSession()
    if (!loaded.ok || !loaded.value) {
      set({ hydrated: true, session: null, context: null })
      return
    }
    const context = await createJellyfinContext(
      loaded.value.serverUrl,
      loaded.value.accessToken,
    )
    if (!context.ok) {
      logger.warn('session restore failed')
      set({ hydrated: true, session: null, context: null })
      return
    }
    set({ hydrated: true, session: loaded.value, context: context.value })
  },
  setAuthenticated: async (session, context) => {
    await saveSession(session)
    set({ session, context, hydrated: true })
  },
  logout: async () => {
    await clearSession()
    set({ session: null, context: null, hydrated: true })
  },
  markUnauthorized: async () => {
    logger.warn('401 — clearing session')
    await get().logout()
  },
}))
