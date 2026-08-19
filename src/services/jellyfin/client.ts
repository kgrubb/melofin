import { Api, Jellyfin } from '@jellyfin/sdk'
import axios, { type AxiosInstance } from 'axios'
import Constants from 'expo-constants'
import { appError, err, ok, type Result } from '@/src/domain/result'
import { getOrCreateDeviceId } from '@/src/storage/sessionStore'

const APP_NAME = 'Melofin'
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'
const REQUEST_TIMEOUT_MS = 15_000

export type JellyfinContext = {
  readonly api: Api
  readonly axios: AxiosInstance
  readonly serverUrl: string
  readonly deviceId: string
  readonly accessToken?: string
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const shouldRetry = (method: string | undefined, status?: number): boolean => {
  const verb = (method ?? 'get').toLowerCase()
  if (verb !== 'get') return false
  if (status === undefined) return true
  return status >= 500
}

const createAxios = (baseURL: string, accessToken?: string): AxiosInstance => {
  const instance = axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: accessToken
      ? {
          'X-Emby-Token': accessToken,
        }
      : undefined,
  })

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config
      if (!config) throw error
      const retryCount = config.__melofinRetryCount ?? 0
      if (retryCount >= 2 || !shouldRetry(config.method, error.response?.status)) {
        throw error
      }
      config.__melofinRetryCount = retryCount + 1
      const backoff = Math.min(2_000, 200 * 2 ** retryCount)
      await delay(backoff)
      return instance.request(config)
    },
  )

  return instance
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    __melofinRetryCount?: number
  }
}

export const createJellyfinContext = async (
  serverUrl: string,
  accessToken?: string,
): Promise<Result<JellyfinContext>> => {
  const deviceIdResult = await getOrCreateDeviceId()
  if (!deviceIdResult.ok) return deviceIdResult

  try {
    const jellyfin = new Jellyfin({
      clientInfo: { name: APP_NAME, version: APP_VERSION },
      deviceInfo: { name: 'iPhone', id: deviceIdResult.value },
    })
    const api = jellyfin.createApi(serverUrl, accessToken)
    return ok({
      api,
      axios: createAxios(serverUrl, accessToken),
      serverUrl,
      deviceId: deviceIdResult.value,
      accessToken,
    })
  } catch (cause) {
    return err(appError('unknown', 'Client init failed', cause))
  }
}

export const probePublicInfo = async (
  serverUrl: string,
  signal?: AbortSignal,
): Promise<Result<{ serverName: string; version: string }>> => {
  try {
    const response = await createAxios(serverUrl).get('/System/Info/Public', { signal })
    return ok({
      serverName: String(response.data?.ServerName ?? 'Jellyfin'),
      version: String(response.data?.Version ?? 'unknown'),
    })
  } catch (cause) {
    if (axios.isCancel(cause) || (cause as { name?: string }).name === 'CanceledError') {
      return err(appError('cancelled', 'Cancelled', cause))
    }
    return err(appError('network', 'Server unreachable', cause))
  }
}

export const mapAuthError = (cause: unknown): Result<never> => {
  if (axios.isAxiosError(cause)) {
    if (cause.response?.status === 401) {
      return err(appError('unauthorized', 'Invalid username or password', cause))
    }
    if (cause.code === 'ECONNABORTED') {
      return err(appError('timeout', 'Timed out', cause))
    }
  }
  return err(appError('network', 'Auth failed', cause))
}

export { APP_NAME, APP_VERSION }
