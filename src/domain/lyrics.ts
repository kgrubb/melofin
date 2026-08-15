import { ticksToMs } from '@/src/domain/jellyfin'

export type LyricLine = {
  readonly text: string
  /** Present when timed/synced; omitted for plain lyrics. */
  readonly startMs?: number
}

export type LyricsPayload = {
  readonly synced: boolean
  readonly lines: readonly LyricLine[]
}

/** Genius/scrape chrome — drop the whole line. */
const isBoilerplateLine = (text: string): boolean => {
  const t = text.trim()
  if (!t) return true
  if (/^\d{1,4}\s+contributors?$/i.test(t)) return true
  if (/^read\s*more$/i.test(t)) return true
  if (/^(?:embed|share|copy|edit|follow|home)$/i.test(t)) return true
  if (/^\d{1,7}\s*embed$/i.test(t)) return true
  if (/^you might also like\b/i.test(t)) return true
  if (/^get tickets\b/i.test(t)) return true
  if (/^see .+ live$/i.test(t)) return true
  if (/^translations?$/i.test(t)) return true
  // Genius page title lines: "What You Know Lyrics"
  if (t.length <= 120 && /\blyrics$/i.test(t) && !/[.!?…"']/.test(t)) return true
  return false
}

/**
 * Strip Genius/Musixmatch scrape chrome from lyric text.
 * Handles mashed one-liners from on-demand plugin fetches.
 */
export const cleanLyricText = (raw: string): string => {
  let text = raw
    .replace(/\u00a0/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim()
  if (!text) return ''

  // Leading "N Contributors" (often glued to the title with no space)
  text = text.replace(/^\d{1,4}\s+contributors?/i, '').trim()
  // Genius page title “… Lyrics” (capital L; avoid eating normal lyric lines)
  text = text.replace(/^(?!\[)[^.\n!?]{1,100}?\bLyrics\b[\s|]*/, '').trim()
  // Genius CTA glued on: ReadMore / Read More
  text = text.replace(/^(?:read\s*more\b[\s|]*)+/i, '').trim()

  // Truncate promo tails often appended to the last verse blob.
  text = text.replace(/\byou might also like\b[\s\S]*$/i, '').trim()
  text = text.replace(/\bsee .+? live\b[\s\S]*$/i, '').trim()
  text = text.replace(/\bget tickets\b[\s\S]*$/i, '').trim()
  // Genius always ends scrapes with "123Embed" / "1.2KEmbed"
  text = text.replace(/\s*\d{1,3}(?:\.\d)?k?\s*embed\s*$/i, '').trim()
  text = text.replace(/\s*\bembed\s*$/i, '').trim()

  // Inline leftovers that sometimes sit between verses in a single blob.
  text = text.replace(/\byou might also like\b/gi, '\n')
  text = text.replace(/\b\d{1,3}(?:\.\d)?k?\s*embed\b/gi, '\n')
  text = text.replace(/\bread\s*more\b/gi, '\n')
  text = text.replace(/\b\d{1,4}\s+contributors?/gi, '\n')

  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Expand a cleaned blob that still contains newlines into separate lines. */
const expandCleanedText = (
  cleaned: string,
  startMs: number | undefined,
): LyricLine[] => {
  const parts = cleaned
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !isBoilerplateLine(part))
  if (parts.length <= 1) {
    const text = parts[0] ?? ''
    if (!text) return []
    return [startMs === undefined ? { text } : { text, startMs }]
  }
  // Timed blobs that smuggle newlines: keep timing only on the first part.
  return parts.map((text, index) =>
    index === 0 && startMs !== undefined ? { text, startMs } : { text },
  )
}

export const mapLyricDto = (dto: {
  readonly Metadata?: { readonly IsSynced?: boolean | null } | null
  readonly Lyrics?: readonly {
    readonly Text?: string
    readonly Start?: number | null
  }[]
}): LyricsPayload => {
  const raw = dto.Lyrics ?? []
  const lines: LyricLine[] = []
  for (const line of raw) {
    const cleaned = cleanLyricText(String(line.Text ?? ''))
    if (!cleaned) continue
    const startTicks = line.Start
    const startMs =
      startTicks === null || startTicks === undefined
        ? undefined
        : ticksToMs(Number(startTicks))
    const safeStart =
      startMs === undefined || Number.isNaN(startMs) ? undefined : startMs
    lines.push(...expandCleanedText(cleaned, safeStart))
  }
  return finalizeLyrics(lines, dto.Metadata?.IsSynced)
}

/** Re-clean cached/offline payloads that were stored before scrape filtering. */
export const sanitizeLyricsPayload = (payload: LyricsPayload): LyricsPayload => {
  const lines: LyricLine[] = []
  for (const line of payload.lines) {
    const cleaned = cleanLyricText(line.text)
    if (!cleaned) continue
    lines.push(...expandCleanedText(cleaned, line.startMs))
  }
  return finalizeLyrics(lines, payload.synced)
}

const finalizeLyrics = (
  lines: LyricLine[],
  syncedHint?: boolean | null,
): LyricsPayload => {
  while (lines.length > 0 && isBoilerplateLine(lines[0]!.text)) {
    lines.shift()
  }
  while (lines.length > 0 && isBoilerplateLine(lines[lines.length - 1]!.text)) {
    lines.pop()
  }
  // On-demand Genius misses often leave only chrome — treat as empty.
  if (lines.length > 0 && lines.every((line) => isBoilerplateLine(line.text))) {
    return { synced: false, lines: [] }
  }
  const anyTimed = lines.some((line) => line.startMs !== undefined)
  const synced =
    syncedHint === true || (syncedHint !== false && anyTimed)
  return { synced: synced && anyTimed, lines }
}

/** Index of the active synced line for `positionMs`, or -1. */
export const activeLyricIndex = (
  lines: readonly LyricLine[],
  positionMs: number,
): number => {
  if (lines.length === 0) return -1
  let active = -1
  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i]?.startMs
    if (start === undefined) continue
    if (start <= positionMs) active = i
    else break
  }
  return active
}

export const seekMsForLine = (line: LyricLine | undefined): number | null => {
  if (!line || line.startMs === undefined) return null
  return Math.max(0, line.startMs)
}

export const offlineLyricsRelativePath = (itemId: string): string =>
  `lyrics/${itemId}.json`
