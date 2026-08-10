import { Platform } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { appError, err, type Result } from '@/src/domain/result'
import {
  attemptCompleteSsoAuth,
  type AuthSuccess,
} from '@/src/services/jellyfin/auth'

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('aborted'))
      },
      { once: true },
    )
  })

const pollSsoAuth = async (
  serverUrl: string,
  provider: string,
  state: string,
  allowInsecureHttp: boolean,
  signal: AbortSignal,
): Promise<Result<AuthSuccess>> => {
  const deadline = Date.now() + 5 * 60_000
  while (!signal.aborted) {
    if (Date.now() > deadline) {
      return err(appError('timeout', 'SSO timed out'))
    }
    const attempt = await attemptCompleteSsoAuth(
      serverUrl,
      provider,
      state,
      allowInsecureHttp,
    )
    if (attempt !== 'pending') return attempt
    try {
      await sleep(500, signal)
    } catch {
      return err(appError('cancelled', 'SSO cancelled'))
    }
  }
  return err(appError('cancelled', 'SSO cancelled'))
}

/**
 * Opens the IdP authorize URL in the system browser (passkeys work) and polls
 * Jellyfin `/sso/OID/Auth` until the OIDC callback marks `state` Valid.
 */
export const loginWithSsoAuthorizeUrl = async (
  serverUrl: string,
  provider: string,
  authorizeUrl: string,
  state: string,
  allowInsecureHttp: boolean,
): Promise<Result<AuthSuccess>> => {
  if (Platform.OS === 'web') {
    return err(appError('validation', 'Use popup SSO on web'))
  }

  const controller = new AbortController()
  const gate = { done: false }

  const resolveOnce = (result: Result<AuthSuccess>): Result<AuthSuccess> | null => {
    if (gate.done) return null
    gate.done = true
    controller.abort()
    try {
      WebBrowser.dismissBrowser()
    } catch {
      // Android / already dismissed
    }
    return result
  }

  return new Promise<Result<AuthSuccess>>((resolve) => {
    void pollSsoAuth(
      serverUrl,
      provider,
      state,
      allowInsecureHttp,
      controller.signal,
    ).then((result) => {
      const once = resolveOnce(result)
      if (once) resolve(once)
    })

    void WebBrowser.openBrowserAsync(authorizeUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      createTask: false,
      showInRecents: true,
    }).then(async () => {
      if (gate.done) return
      const last = await attemptCompleteSsoAuth(
        serverUrl,
        provider,
        state,
        allowInsecureHttp,
      )
      const once = resolveOnce(
        last !== 'pending' && last.ok
          ? last
          : err(
              appError(
                'cancelled',
                'SSO window closed before Melio could finish sign-in',
              ),
            ),
      )
      if (once) resolve(once)
    })
  })
}
