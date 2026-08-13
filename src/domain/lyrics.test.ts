import { describe, expect, it } from 'vitest'
import {
  activeLyricIndex,
  cleanLyricText,
  mapLyricDto,
  offlineLyricsRelativePath,
  seekMsForLine,
} from '@/src/domain/lyrics'

describe('lyrics', () => {
  it('maps synced and plain lyric DTOs', () => {
    const synced = mapLyricDto({
      Metadata: { IsSynced: true },
      Lyrics: [
        { Text: 'One', Start: 10_000 },
        { Text: 'Two', Start: 20_000 },
        { Text: '  ', Start: 30_000 },
      ],
    })
    expect(synced.synced).toBe(true)
    expect(synced.lines).toEqual([
      { text: 'One', startMs: 1 },
      { text: 'Two', startMs: 2 },
    ])

    const plain = mapLyricDto({
      Metadata: { IsSynced: false },
      Lyrics: [{ Text: 'Verse' }, { Text: 'Chorus' }],
    })
    expect(plain.synced).toBe(false)
    expect(plain.lines).toEqual([{ text: 'Verse' }, { text: 'Chorus' }])
  })

  it('strips Genius scrape chrome from lyric text', () => {
    expect(
      cleanLyricText('38 contributors What You Know Lyrics ReadMore How you feel'),
    ).toBe('How you feel')
    expect(cleanLyricText('12 Contributors')).toBe('')
    expect(cleanLyricText('[Verse 1]')).toBe('[Verse 1]')
    expect(cleanLyricText('I love lyrics in my song')).toBe('I love lyrics in my song')
    expect(cleanLyricText('last line1.2KEmbed')).toBe('last line')
    expect(
      cleanLyricText('real verse You might also like Fake Song 99Embed'),
    ).toBe('real verse')

    const scraped = mapLyricDto({
      Metadata: { IsSynced: false },
      Lyrics: [
        { Text: '38 contributors' },
        { Text: 'What You Know Lyrics' },
        { Text: 'ReadMore' },
        { Text: 'Aw baby I know' },
        { Text: 'You know I know' },
        { Text: 'Embed' },
        { Text: 'You might also like' },
        { Text: 'See Two Door Cinema Club Live' },
      ],
    })
    expect(scraped.lines.map((l) => l.text)).toEqual([
      'Aw baby I know',
      'You know I know',
    ])

    const mashed = mapLyricDto({
      Lyrics: [
        {
          Text: '38 contributors What You Know Lyrics ReadMore Aw baby I know',
        },
      ],
    })
    expect(mashed.lines).toEqual([{ text: 'Aw baby I know' }])

    // On-demand plugin fetch: one blob with newlines + footer chrome.
    const onDemand = mapLyricDto({
      Lyrics: [
        {
          Text:
            '16 ContributorsCool Song Lyrics\n[Verse 1]\nHello there\nYou might also like\nOther Track\n42Embed',
        },
      ],
    })
    expect(onDemand.lines.map((l) => l.text)).toEqual([
      '[Verse 1]',
      'Hello there',
    ])

    const onlyChrome = mapLyricDto({
      Lyrics: [{ Text: '5 Contributors' }, { Text: 'Some Song Lyrics' }],
    })
    expect(onlyChrome.lines).toEqual([])
  })

  it('tracks active line and seek targets', () => {
    const lines = [
      { text: 'a', startMs: 0 },
      { text: 'b', startMs: 1000 },
      { text: 'c', startMs: 2000 },
    ]
    expect(activeLyricIndex(lines, 0)).toBe(0)
    expect(activeLyricIndex(lines, 999)).toBe(0)
    expect(activeLyricIndex(lines, 1000)).toBe(1)
    expect(activeLyricIndex(lines, 2500)).toBe(2)
    expect(activeLyricIndex([], 10)).toBe(-1)
    expect(seekMsForLine(lines[1])).toBe(1000)
    expect(seekMsForLine({ text: 'x' })).toBeNull()
  })

  it('builds offline lyrics path', () => {
    expect(offlineLyricsRelativePath('abc')).toBe('lyrics/abc.json')
  })
})
