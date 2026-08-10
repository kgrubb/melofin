import { Platform } from 'react-native'
import { ssoStartUrl } from '@/src/services/jellyfin/sso'

export type SsoBridgeResult =
  | { readonly kind: 'state'; readonly data: string }
  | {
      readonly kind: 'auth'
      readonly accessToken: string
      readonly userId: string
      readonly userName: string
    }

const parseSsoBridgeMessage = (raw: string): SsoBridgeResult | null => {
  try {
    const parsed = JSON.parse(raw) as {
      type?: string
      data?: string
      AccessToken?: string
      User?: { Id?: string; id?: string; Name?: string; name?: string }
      payload?: unknown
    }
    const body = parsed.type === undefined && parsed.payload ? (parsed.payload as typeof parsed) : parsed
    if (body.type === 'state' && typeof body.data === 'string') {
      return { kind: 'state', data: body.data }
    }
    if (body.type === 'auth' && body.AccessToken && body.User) {
      const userId = body.User.Id ?? body.User.id
      const userName = body.User.Name ?? body.User.name
      if (userId && userName) {
        return {
          kind: 'auth',
          accessToken: String(body.AccessToken),
          userId: String(userId),
          userName: String(userName),
        }
      }
    }
  } catch {
    if (raw.trim().length > 0) return { kind: 'state', data: raw }
  }
  return null
}

export const openSsoPopup = (
  serverUrl: string,
  provider: string,
): Promise<SsoBridgeResult> => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return Promise.reject(new Error('Popup SSO is only available on web'))
  }

  const url = ssoStartUrl(serverUrl, provider)
  const popup = window.open(url, 'melio-sso', 'popup=yes,width=480,height=720')
  if (!popup) {
    return Promise.reject(new Error('Popup blocked. Allow popups for Melio, or use Quick Connect.'))
  }

  return new Promise((resolve, reject) => {
    const state = { settled: false }
    const finish = (result: SsoBridgeResult) => {
      if (state.settled) return
      state.settled = true
      window.removeEventListener('message', onMessage)
      clearInterval(timer)
      try {
        popup.close()
      } catch {
        // ignore
      }
      resolve(result)
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data) return
      if (typeof data === 'string') {
        const parsed = parseSsoBridgeMessage(data)
        if (parsed) finish(parsed)
        return
      }
      if (data.type === 'melio-sso') {
        const parsed = parseSsoBridgeMessage(
          typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload),
        )
        if (parsed) finish(parsed)
      }
    }

    window.addEventListener('message', onMessage)

    const timer = window.setInterval(() => {
      if (popup.closed && !state.settled) {
        state.settled = true
        window.removeEventListener('message', onMessage)
        clearInterval(timer)
        reject(
          new Error(
            'SSO window closed before Melio received credentials. On web, use Quick Connect or password, or try Authentik again.',
          ),
        )
      }
    }, 400)
  })
}
