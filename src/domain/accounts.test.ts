import { describe, expect, it } from 'vitest'
import {
  emptyAccountsState,
  removeAccountFromState,
  sessionAccountId,
  upsertAccount,
  type AccountSession,
} from '@/src/domain/accounts'

const session = (userId: string, serverUrl = 'https://jf'): AccountSession => ({
  serverUrl,
  userId,
  accessToken: 't',
  userName: userId,
  serverName: 'JF',
  allowInsecureHttp: true,
})

describe('accounts', () => {
  it('upserts and removes accounts without cross-bleed of active id', () => {
    let state = upsertAccount(emptyAccountsState(), session('u1'))
    expect(state.activeId).toBe(sessionAccountId(session('u1')))
    state = upsertAccount(state, session('u2', 'https://other'))
    expect(state.accounts).toHaveLength(2)
    expect(state.activeId).toBe(sessionAccountId(session('u2', 'https://other')))
    state = removeAccountFromState(state, state.activeId!)
    expect(state.accounts).toHaveLength(1)
    expect(state.activeId).toBe(sessionAccountId(session('u1')))
  })

  it('keeps active id when removing a non-active account', () => {
    let state = upsertAccount(emptyAccountsState(), session('u1'))
    state = upsertAccount(state, session('u2'))
    const active = state.activeId
    const other = state.accounts.find((a) => a.accountId !== active)!.accountId
    state = removeAccountFromState(state, other)
    expect(state.activeId).toBe(active)
  })
})
