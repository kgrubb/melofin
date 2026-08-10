import { describe, expect, it } from 'vitest'
import { extractOidcState, ssoStartUrl } from '@/src/services/jellyfin/sso'

describe('sso helpers', () => {
  it('builds start urls', () => {
    expect(ssoStartUrl('https://jf', 'keycloak')).toBe(
      'https://jf/sso/OID/start/keycloak',
    )
  })

  it('extracts OIDC state from authorize urls', () => {
    expect(
      extractOidcState(
        'https://auth.example/authorize?client_id=jf&state=abc%2F123&response_type=code',
      ),
    ).toBe('abc/123')
    expect(extractOidcState('https://auth.example/authorize')).toBeNull()
    expect(extractOidcState('not a url')).toBeNull()
  })
})
