import { beforeEach, describe, expect, it, vi } from 'vitest'

/* eslint-disable import/first -- mocks must load before artwork module */
vi.mock('expo-file-system', () => {
  class FakeDir {
    uri = 'file:///melofin/carplay-art'
    exists = true
    create() {
      return undefined
    }
  }
  class FakeFile {
    uri: string
    exists = false
    constructor(...parts: string[]) {
      this.uri = `file:///${parts.join('/')}`
    }
    static async downloadFileAsync(url: string, dest: { uri: string }) {
      return { uri: dest.uri || url }
    }
  }
  return {
    Directory: FakeDir,
    File: FakeFile,
    Paths: { document: 'file:///document' },
  }
})

vi.mock('@/src/services/jellyfin/library', () => ({
  resizeArtworkUrl: (uri: string) => uri.replace('hero', 'thumb'),
}))

vi.mock('@/src/logging/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

import {
  bumpArtworkGeneration,
  clearArtworkCache,
  currentArtworkGeneration,
  resolveCarPlayArtwork,
} from '@/src/carplay/artwork'

describe('carplay artwork', () => {
  beforeEach(() => {
    clearArtworkCache()
    bumpArtworkGeneration()
  })

  it('bumps generation and cancels stale resolve', async () => {
    const gen = currentArtworkGeneration()
    bumpArtworkGeneration()
    const result = await resolveCarPlayArtwork({
      uri: 'https://example/img',
      generation: gen,
    })
    expect(result).toBeUndefined()
  })

  it('passes through local file uris and caches them', async () => {
    const gen = currentArtworkGeneration()
    const first = await resolveCarPlayArtwork({
      uri: 'file:///melofin/art.jpg',
      itemId: 't1',
      generation: gen,
    })
    expect(first).toBe('file:///melofin/art.jpg')
    const second = await resolveCarPlayArtwork({
      uri: 'file:///melofin/art.jpg',
      itemId: 't1',
      generation: gen,
    })
    expect(second).toBe(first)
  })

  it('returns undefined for empty uri', async () => {
    expect(
      await resolveCarPlayArtwork({
        generation: currentArtworkGeneration(),
      }),
    ).toBeUndefined()
  })

  it('clears cache without throwing', () => {
    expect(() => clearArtworkCache()).not.toThrow()
  })
})
