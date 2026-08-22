import 'intl-pluralrules'
import { describe, expect, it } from 'vitest'
import i18n from 'i18next'
import ICU from 'i18next-icu'
import { castError } from '@/src/cast/errors'
import de from '@/src/i18n/locales/de/common.json'
import {
  castErrorMessageFromT,
  localizeCastDevice,
  localizeCastLabel,
} from '@/src/i18n/castCopy'

const t = (() => {
  void i18n.use(ICU).init({
    resources: { de: { common: de } },
    lng: 'de',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })
  return i18n.getFixedT('de', 'common')
})()

describe('castCopy', () => {
  it('localizes known device labels', () => {
    expect(localizeCastLabel('This Phone', t)).toBe('Dieses Telefon')
    expect(localizeCastLabel('Living Room', t)).toBe('Living Room')
  })

  it('localizes cast devices at display time', () => {
    expect(
      localizeCastDevice(
        { id: 'local', name: 'This Phone', kind: 'local', subtitle: 'This device' },
        t,
      ),
    ).toEqual({
      id: 'local',
      name: 'Dieses Telefon',
      kind: 'local',
      subtitle: 'Dieses Gerät',
    })
  })

  it('localizes cast errors by code', () => {
    expect(castErrorMessageFromT(castError('timeout', 'ignored'), t)).toBe(
      'Verbindung abgelaufen. Erneut versuchen.',
    )
  })
})
