import { describe, expect, it } from 'vitest'
import {
  artworkUrl,
  buildUniversalStreamUrl,
  mapBaseItem,
  toQueueTrack,
  userImageUrl,
} from '@/src/services/jellyfin/mappers'
import type { JellyfinContext } from '@/src/services/jellyfin/client'

describe('library mappers', () => {
  it('maps base items and queue tracks', () => {
    const item = mapBaseItem({
      Id: '1',
      Name: 'Song',
      Type: 'Audio',
      Artists: ['A'],
      Album: 'B',
      RunTimeTicks: 10_000_000,
      ImageTags: { Primary: 'tag' },
      MediaSources: [{ Id: 'ms1' }],
      ChildCount: 3,
    })
    expect(item.id).toBe('1')
    expect(item.durationMs).toBe(1000)
    expect(item.childCount).toBe(3)
    expect(toQueueTrack(item, 'art').artworkUrl).toBe('art')
    expect(toQueueTrack(item).artist).toBe('A')
  })

  it('maps overview text', () => {
    expect(
      mapBaseItem({
        Id: 'p',
        Name: 'Mix',
        Type: 'Playlist',
        Overview: '  Late night drive  ',
      }).overview,
    ).toBe('Late night drive')
    expect(mapBaseItem({ Id: 'p', Name: 'Mix', Type: 'Playlist' }).overview).toBeUndefined()
  })

  it('falls back to album primary artwork for songs', () => {
    const item = mapBaseItem({
      Id: 'song',
      Name: 'Song',
      Type: 'Audio',
      AlbumId: 'album',
      AlbumPrimaryImageTag: 'album-tag',
    })
    expect(item.imageTag).toBe('album-tag')
    expect(item.imageItemId).toBe('album')
  })

  it('falls back to album artists and empty media source', () => {
    const item = mapBaseItem({
      Id: '2',
      Name: 'Song',
      Type: 'Audio',
      AlbumArtists: [{ Name: 'Album Artist' }],
      MediaSources: [],
    })
    expect(item.artists).toEqual(['Album Artist'])
    expect(item.mediaSourceId).toBe('2')
    expect(item.imageTag).toBeUndefined()
    expect(mapBaseItem({}).name).toBe('Unknown')
  })

  it('builds artwork and stream urls', () => {
    const context = {
      serverUrl: 'https://jf',
      deviceId: 'd',
      accessToken: 't',
    } as JellyfinContext
    expect(artworkUrl(context, '1', 'tag')).toContain('Images/Primary')
    expect(artworkUrl(context, '1', 'tag')).toContain('maxHeight=600')
    expect(artworkUrl(context, '1', 'tag')).toContain('tag=tag')
    expect(artworkUrl(context, '1', 'tag', 'thumb')).toContain('maxHeight=120')
    expect(artworkUrl(context, '1', 'tag', 'card')).toContain('maxHeight=320')
    expect(artworkUrl(context, '1')).toContain('Images/Primary')
    expect(artworkUrl(context, '1')).not.toContain('tag=')
    expect(artworkUrl(context, '')).toBeUndefined()
    expect(userImageUrl(context, 'u1')).toContain('/Users/u1/Images/Primary')
    expect(userImageUrl(context, 'u1', 'ptag', 'thumb')).toContain('tag=ptag')
    expect(userImageUrl(context, 'u1', undefined, 'thumb')).toContain('maxHeight=120')
    expect(userImageUrl(context, '')).toBeUndefined()
    expect(buildUniversalStreamUrl(context, '1', 'u')).toContain('UserId=u')
    expect(
      buildUniversalStreamUrl(
        { serverUrl: 'https://jf', deviceId: 'd' } as JellyfinContext,
        '1',
        'u',
      ),
    ).not.toContain('api_key=')
  })
})
