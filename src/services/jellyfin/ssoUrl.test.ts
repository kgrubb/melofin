import { describe, expect, it } from 'vitest'
import { ssoStartUrl } from '@/src/services/jellyfin/sso'

describe('sso helpers', () => {
  it('builds start urls', () => {
    expect(ssoStartUrl('https://jf', 'keycloak')).toBe(
      'https://jf/sso/OID/start/keycloak',
    )
  })
})
