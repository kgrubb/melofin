/** Sniff a playable audio file extension from the first bytes (AVPlayer needs one). */

const asciiAt = (header: Uint8Array, offset: number, text: string): boolean => {
  if (header.length < offset + text.length) return false
  for (let i = 0; i < text.length; i += 1) {
    if (header[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

/** Extension without the dot, or null — wrong guess is worse than unknown. */
export const audioExtensionFromHeader = (header: Uint8Array): string | null => {
  if (header.length < 12) return null
  if (asciiAt(header, 0, 'fLaC')) return 'flac'
  if (asciiAt(header, 0, 'OggS')) return 'ogg'
  if (asciiAt(header, 0, 'RIFF') && asciiAt(header, 8, 'WAVE')) return 'wav'
  if (asciiAt(header, 4, 'ftyp')) return 'm4a'
  if (asciiAt(header, 0, 'ID3')) return 'mp3'
  const b0 = header[0]
  const b1 = header[1]
  if (b0 === 0xff && b1 != null && (b1 & 0xe0) === 0xe0) {
    // ADTS AAC vs MP3 frame sync. Layer 0 is reserved → AAC.
    const layer = (b1 >> 1) & 0x3
    if (layer === 0) return 'aac'
    return 'mp3'
  }
  if (
    header[0] === 0x30 &&
    header[1] === 0x26 &&
    header[2] === 0xb2 &&
    header[3] === 0x75
  ) {
    return 'wma'
  }
  return null
}
