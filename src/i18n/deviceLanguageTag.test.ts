import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: vi.fn(() => null),
}))

describe('readDeviceLanguageTag', () => {
  it('falls back when ExpoLocalization is missing from the dev client', async () => {
    const { readDeviceLanguageTag } = await import('@/src/i18n/deviceLanguageTag')
    expect(readDeviceLanguageTag()).toBeTruthy()
  })
})
