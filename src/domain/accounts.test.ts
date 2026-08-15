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
    const withU1 = upsertAccount(emptyAccountsState(), session('u1'))
    expect(withU1.activeId).toBe(sessionAccountId(session('u1')))
    const withU2 = upsertAccount(withU1, session('u2', 'https://other'))
    expect(withU2.accounts).toHaveLength(2)
    expect(withU2.activeId).toBe(sessionAccountId(session('u2', 'https://other')))
    const state = removeAccountFromState(withU2, withU2.activeId!)
    expect(state.accounts).toHaveLength(1)
    expect(state.activeId).toBe(sessionAccountId(session('u1')))
  })

  it('keeps active id when removing a non-active account', () => {
    const withBoth = upsertAccount(
      upsertAccount(emptyAccountsState(), session('u1')),
      session('u2'),
    )
    const active = withBoth.activeId
    const other = withBoth.accounts.find((a) => a.accountId !== active)!.accountId
    const state = removeAccountFromState(withBoth, other)
    expect(state.activeId).toBe(active)
  })
})
