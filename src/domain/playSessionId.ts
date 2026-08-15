const byteToHex = (value: number): string =>
  value.toString(16).padStart(2, '0')

/** Hermes does not provide `crypto.randomUUID`. Keep playstate IDs working. */
export const newPlaySessionId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  const versioned = bytes.map((byte, index) => {
    if (index === 6) return (byte & 0x0f) | 0x40
    if (index === 8) return (byte & 0x3f) | 0x80
    return byte
  })
  const hex = versioned.map(byteToHex).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
