export const ssoStartUrl = (serverUrl: string, provider: string): string =>
  `${serverUrl}/sso/OID/start/${encodeURIComponent(provider)}`
