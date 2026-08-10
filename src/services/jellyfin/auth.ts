import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api'
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api'
import { getQuickConnectApi } from '@jellyfin/sdk/lib/utils/api/quick-connect-api'
import axios from 'axios'
import { appError, err, ok, type Result } from '@/src/domain/result'
import {
  createJellyfinContext,
  mapAuthError,
  type JellyfinContext,
  APP_NAME,
  APP_VERSION,
} from '@/src/services/jellyfin/client'
import type { StoredSession } from '@/src/storage/sessionStore'

export type AuthSuccess = StoredSession & {
  readonly context: JellyfinContext
}

const toSuccess = async (
  serverUrl: string,
  accessToken: string,
  userId: string,
  userName: string,
  allowInsecureHttp: boolean,
  serverName = 'Jellyfin',
): Promise<Result<AuthSuccess>> => {
  const authenticated = await createJellyfinContext(serverUrl, accessToken)
  if (!authenticated.ok) return authenticated
  return ok({
    serverUrl,
    userId,
    accessToken,
    userName,
    serverName,
    allowInsecureHttp,
    context: authenticated.value,
  })
}

export const loginWithPassword = async (
  serverUrl: string,
  username: string,
  password: string,
  allowInsecureHttp: boolean,
): Promise<Result<AuthSuccess>> => {
  const contextResult = await createJellyfinContext(serverUrl)
  if (!contextResult.ok) return contextResult
  try {
    const response = await getUserApi(contextResult.value.api).authenticateUserByName({
      authenticateUserByName: { Username: username, Pw: password },
    })
    const accessToken = response.data.AccessToken
    const userId = response.data.User?.Id
    const userName = response.data.User?.Name
    if (!accessToken || !userId || !userName) {
      return err(appError('unauthorized', 'Incomplete auth response'))
    }
    const info = await getSystemApi(contextResult.value.api).getPublicSystemInfo()
    return toSuccess(
      serverUrl,
      accessToken,
      userId,
      userName,
      allowInsecureHttp,
      String(info.data.ServerName ?? 'Jellyfin'),
    )
  } catch (cause) {
    return mapAuthError(cause)
  }
}

type QuickConnectState = {
  readonly secret: string
  readonly code: string
}

export const initiateQuickConnect = async (
  serverUrl: string,
): Promise<Result<QuickConnectState>> => {
  const contextResult = await createJellyfinContext(serverUrl)
  if (!contextResult.ok) return contextResult
  try {
    const response = await getQuickConnectApi(contextResult.value.api).initiateQuickConnect()
    const secret = response.data.Secret
    const code = response.data.Code
    if (!secret || !code) return err(appError('unknown', 'Quick Connect failed'))
    return ok({ secret, code })
  } catch (cause) {
    return err(appError('network', 'Quick Connect failed', cause))
  }
}

const pollOnce = async (
  serverUrl: string,
  secret: string,
): Promise<Result<'pending' | AuthSuccess>> => {
  const contextResult = await createJellyfinContext(serverUrl)
  if (!contextResult.ok) return contextResult
  try {
    const qc = getQuickConnectApi(contextResult.value.api)
    const state = await qc.getQuickConnectState({ secret })
    if (!state.data.Authenticated) return ok('pending')
    const auth = await getUserApi(contextResult.value.api).authenticateWithQuickConnect({
      quickConnectDto: { Secret: secret },
    })
    const accessToken = auth.data.AccessToken
    const userId = auth.data.User?.Id
    const userName = auth.data.User?.Name
    if (!accessToken || !userId || !userName) {
      return err(appError('unauthorized', 'Quick Connect incomplete'))
    }
    const authenticated = await createJellyfinContext(serverUrl, accessToken)
    if (!authenticated.ok) return authenticated
    const info = await getSystemApi(authenticated.value.api).getPublicSystemInfo()
    return toSuccess(
      serverUrl,
      accessToken,
      userId,
      userName,
      serverUrl.startsWith('http://'),
      String(info.data.ServerName ?? 'Jellyfin'),
    )
  } catch (cause) {
    return err(appError('network', 'Quick Connect poll failed', cause))
  }
}

export const pollQuickConnect = async (
  serverUrl: string,
  secret: string,
  signal: AbortSignal,
  attempt = 0,
): Promise<Result<AuthSuccess>> => {
  if (signal.aborted) return err(appError('cancelled', 'Cancelled'))
  if (attempt >= 60) return err(appError('timeout', 'Quick Connect timed out'))
  const result = await pollOnce(serverUrl, secret)
  if (!result.ok) return result
  if (result.value !== 'pending') return ok(result.value)
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 1500)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
  if (signal.aborted) return err(appError('cancelled', 'Cancelled'))
  return pollQuickConnect(serverUrl, secret, signal, attempt + 1)
}

export const listSsoProviders = async (
  serverUrl: string,
): Promise<Result<readonly string[]>> => {
  const contextResult = await createJellyfinContext(serverUrl)
  if (!contextResult.ok) return contextResult
  try {
    const response = await contextResult.value.axios.get<string[]>('/sso/OID/GetNames')
    return ok(Array.isArray(response.data) ? response.data.map(String) : [])
  } catch (cause) {
    if (axios.isAxiosError(cause) && cause.response?.status === 404) return ok([])
    return err(appError('network', 'SSO providers failed', cause))
  }
}

export const loginWithAccessToken = (
  serverUrl: string,
  accessToken: string,
  userId: string,
  userName: string,
  allowInsecureHttp: boolean,
  serverName = 'Jellyfin',
): Promise<Result<AuthSuccess>> =>
  toSuccess(serverUrl, accessToken, userId, userName, allowInsecureHttp, serverName)

type SsoAuthAttempt = 'pending' | Result<AuthSuccess>

/**
 * Redeems a Jellyfin SSO OID state for an access token.
 * Returns `'pending'` when the IdP callback has not marked the state Valid yet
 * (plugin responds with HTTP 500), so callers can poll safely.
 */
export const attemptCompleteSsoAuth = async (
  serverUrl: string,
  provider: string,
  data: string,
  allowInsecureHttp: boolean,
): Promise<SsoAuthAttempt> => {
  const base = await createJellyfinContext(serverUrl)
  if (!base.ok) return base
  try {
    const response = await base.value.axios.post(
      `/sso/OID/Auth/${encodeURIComponent(provider)}`,
      {
        deviceId: base.value.deviceId,
        deviceName: 'iPhone',
        appName: APP_NAME,
        appVersion: APP_VERSION,
        data,
      },
      {
        validateStatus: (status) => status === 200 || status === 500,
      },
    )
    if (response.status === 500) return 'pending'
    const accessToken = response.data?.AccessToken ?? response.data?.accessToken
    const user = response.data?.User ?? response.data?.user
    const userId = user?.Id ?? user?.id
    const userName = user?.Name ?? user?.name
    if (!accessToken || !userId || !userName) {
      return err(appError('unauthorized', 'SSO incomplete'))
    }
    return toSuccess(
      serverUrl,
      String(accessToken),
      String(userId),
      String(userName),
      allowInsecureHttp,
    )
  } catch (cause) {
    if (axios.isAxiosError(cause) && !cause.response) return 'pending'
    return mapAuthError(cause)
  }
}

export const completeSsoAuth = async (
  serverUrl: string,
  provider: string,
  data: string,
  allowInsecureHttp: boolean,
): Promise<Result<AuthSuccess>> => {
  const attempt = await attemptCompleteSsoAuth(
    serverUrl,
    provider,
    data,
    allowInsecureHttp,
  )
  if (attempt === 'pending') {
    return err(appError('unauthorized', 'SSO incomplete'))
  }
  return attempt
}
