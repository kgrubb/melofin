export const ssoStartUrl = (serverUrl: string, provider: string): string =>
  `${serverUrl}/sso/OID/start/${encodeURIComponent(provider)}`

/** OIDC `state` from an authorize or Jellyfin SSO redirect URL. */
export const extractOidcState = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    const state = parsed.searchParams.get('state')
    return state && state.length > 0 ? state : null
  } catch {
    return null
  }
}
