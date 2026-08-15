import { accountScopeKey } from '@/src/domain/accountScope'

export type AccountSession = {
  readonly serverUrl: string
  readonly userId: string
  readonly accessToken: string
  readonly userName: string
  readonly serverName: string
  readonly allowInsecureHttp: boolean
}

export type StoredAccount = AccountSession & {
  readonly accountId: string
}

export type AccountsState = {
  readonly activeId: string | null
  readonly accounts: readonly StoredAccount[]
}

export const emptyAccountsState = (): AccountsState => ({
  activeId: null,
  accounts: [],
})

export const sessionAccountId = (session: AccountSession): string =>
  accountScopeKey({ serverUrl: session.serverUrl, userId: session.userId })

export const upsertAccount = (
  state: AccountsState,
  session: AccountSession,
): AccountsState => {
  const accountId = sessionAccountId(session)
  const account: StoredAccount = { ...session, accountId }
  const without = state.accounts.filter((a) => a.accountId !== accountId)
  return {
    activeId: accountId,
    accounts: [...without, account],
  }
}

export const removeAccountFromState = (
  state: AccountsState,
  accountId: string,
): AccountsState => {
  const accounts = state.accounts.filter((a) => a.accountId !== accountId)
  const activeId =
    state.activeId === accountId
      ? (accounts[0]?.accountId ?? null)
      : state.activeId
  return { activeId, accounts }
}
