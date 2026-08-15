import { describe, expect, it } from 'vitest'
import { audioExtensionFromHeader } from '@/src/domain/audioFormat'

const bytes = (...values: readonly number[]): Uint8Array => Uint8Array.from(values)

const padded = (prefix: readonly number[], length = 16): Uint8Array => {
  const out = new Uint8Array(length)
  out.set(prefix)
  return out
}

describe('audioExtensionFromHeader', () => {
  it('sniffs common containers', () => {
    expect(audioExtensionFromHeader(padded([0x66, 0x4c, 0x61, 0x43]))).toBe('flac')
    expect(audioExtensionFromHeader(padded([0x4f, 0x67, 0x67, 0x53]))).toBe('ogg')
    expect(
      audioExtensionFromHeader(
        padded([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
        ]),
      ),
    ).toBe('wav')
    expect(audioExtensionFromHeader(padded([0x49, 0x44, 0x33]))).toBe('mp3')
    expect(audioExtensionFromHeader(padded([0xff, 0xfb]))).toBe('mp3')
    expect(audioExtensionFromHeader(padded([0xff, 0xf1]))).toBe('aac')
    const m4a = padded([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])
    expect(audioExtensionFromHeader(m4a)).toBe('m4a')
    expect(audioExtensionFromHeader(padded([0x30, 0x26, 0xb2, 0x75]))).toBe(
      'wma',
    )
  })

  it('returns null for unknown or short buffers', () => {
    expect(audioExtensionFromHeader(bytes(1, 2, 3))).toBeNull()
    expect(audioExtensionFromHeader(padded([0x00, 0x11, 0x22, 0x33]))).toBeNull()
  })
})
