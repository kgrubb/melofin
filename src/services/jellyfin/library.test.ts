import { describe, expect, it } from 'vitest'
import {
  artistAlbumsQuery,
  artistAppearsOnAlbumsQuery,
  artistContributingAlbumsQuery,
  genreAlbumsByIdQuery,
  genreAlbumsByNameQuery,
  genreContentByIdQuery,
  genreContentByNameQuery,
  genreTracksQuery,
} from '@/src/services/jellyfin/library'
import {
  artworkUrl,
  audioAuthHeaders,
  buildAudioStreamUrl,
  buildPlaybackStreamCandidates,
  buildUniversalStreamUrl,
  mapBaseItem,
  resizeArtworkUrl,
  toQueueTrack,
  userImageUrl,
} from '@/src/services/jellyfin/mappers'
import type { JellyfinContext } from '@/src/services/jellyfin/client'

describe('artistAlbumsQuery', () => {
  it('filters MusicAlbum by albumArtistIds with year then name sort', () => {
    expect(artistAlbumsQuery('user-1', 'artist-9')).toEqual({
      userId: 'user-1',
      includeItemTypes: ['MusicAlbum'],
      albumArtistIds: ['artist-9'],
      sortBy: ['ProductionYear', 'SortName'],
      sortOrder: ['Ascending'],
    })
    expect(artistAppearsOnAlbumsQuery('user-1', 'artist-9')).toEqual({
      userId: 'user-1',
      includeItemTypes: ['MusicAlbum'],
      artistIds: ['artist-9'],
      sortBy: ['ProductionYear', 'SortName'],
      sortOrder: ['Ascending'],
    })
    expect(artistContributingAlbumsQuery('user-1', 'artist-9')).toEqual({
      userId: 'user-1',
      includeItemTypes: ['MusicAlbum'],
      contributingArtistIds: ['artist-9'],
      sortBy: ['ProductionYear', 'SortName'],
      sortOrder: ['Ascending'],
    })
  })
})

describe('genre album queries', () => {
  it('filters albums by genre id, name, and falls back to tracks', () => {
    expect(genreAlbumsByIdQuery('u', 'g1')).toEqual({
      userId: 'u',
      includeItemTypes: ['MusicAlbum'],
      genreIds: ['g1'],
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
    })
    expect(genreAlbumsByNameQuery('u', 'Hip Hop')).toEqual({
      userId: 'u',
      includeItemTypes: ['MusicAlbum'],
      genres: ['Hip Hop'],
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
    })
    expect(genreTracksQuery('u', 'g1', 'Hip Hop')).toEqual({
      userId: 'u',
      includeItemTypes: ['Audio'],
      sortBy: ['DateCreated'],
      sortOrder: ['Descending'],
      enableUserData: false,
      imageTypeLimit: 1,
      fields: ['ParentId'],
      genres: ['Hip Hop'],
    })
    expect(genreTracksQuery('u', 'g1')).toEqual({
      userId: 'u',
      includeItemTypes: ['Audio'],
      sortBy: ['DateCreated'],
      sortOrder: ['Descending'],
      enableUserData: false,
      imageTypeLimit: 1,
      fields: ['ParentId'],
      genreIds: ['g1'],
    })
    expect(genreContentByIdQuery('u', 'g1')).toEqual({
      userId: 'u',
      includeItemTypes: ['MusicAlbum', 'Audio'],
      genreIds: ['g1'],
      enableImages: false,
      enableUserData: false,
      fields: ['ParentId'],
    })
    expect(genreContentByNameQuery('u', 'Hip Hop')).toEqual({
      userId: 'u',
      includeItemTypes: ['MusicAlbum', 'Audio'],
      genres: ['Hip Hop'],
      enableImages: false,
      enableUserData: false,
      fields: ['ParentId'],
    })
  })
})

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

  it('maps favorite user data onto items and queue tracks', () => {
    const item = mapBaseItem({
      Id: '1',
      Name: 'Song',
      Type: 'Audio',
      UserData: { IsFavorite: true },
    })
    expect(item.isFavorite).toBe(true)
    expect(toQueueTrack(item).isFavorite).toBe(true)
    expect(mapBaseItem({ Id: '2', Name: 'Song', Type: 'Audio' }).isFavorite).toBeUndefined()
  })

  it('maps Genres and GenreItems onto library items', () => {
    const item = mapBaseItem({
      Id: '1',
      Name: 'Song',
      Type: 'Audio',
      Genres: ['Hip Hop', 'Rap'],
      GenreItems: [{ Id: 'g1', Name: 'Alternative' }],
    })
    expect(item.genres).toEqual(['Hip Hop', 'Rap', 'Alternative'])
    expect(item.genreItems).toEqual([{ id: 'g1', name: 'Alternative' }])
  })

  it('maps playback position ticks to milliseconds', () => {
    expect(
      mapBaseItem({
        Id: '1',
        Name: 'Song',
        Type: 'Audio',
        RunTimeTicks: 200_000_000,
        UserData: { PlaybackPositionTicks: 50_000_000 },
      }).playbackPositionMs,
    ).toBe(5000)
    expect(
      mapBaseItem({
        Id: '2',
        Name: 'Song',
        Type: 'Audio',
        UserData: { PlaybackPositionTicks: 0 },
      }).playbackPositionMs,
    ).toBeUndefined()
  })

  it('maps playlist entry ids', () => {
    expect(
      mapBaseItem({
        Id: 'song',
        Name: 'Song',
        Type: 'Audio',
        PlaylistItemId: 'entry-1',
      }).playlistEntryId,
    ).toBe('entry-1')
    expect(
      mapBaseItem({
        Id: 'song',
        Name: 'Song',
        Type: 'Audio',
        PlaylistItemId: '  ',
      }).playlistEntryId,
    ).toBeUndefined()
    expect(mapBaseItem({ Id: 'song', Name: 'Song', Type: 'Audio' }).playlistEntryId).toBeUndefined()
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
    expect(item.albumId).toBe('album')
  })

  it('uses album art for songs even when ImageTags.Primary is set', () => {
    const item = mapBaseItem({
      Id: 'song',
      Name: 'Song',
      Type: 'Audio',
      AlbumId: 'album',
      AlbumPrimaryImageTag: 'album-tag',
      ImageTags: { Primary: 'track-tag' },
    })
    expect(item.imageTag).toBe('album-tag')
    expect(item.imageItemId).toBe('album')
  })

  it('uses ParentId as albumId for library audio, not playlist children', () => {
    expect(
      mapBaseItem({
        Id: 'song',
        Name: 'Song',
        Type: 'Audio',
        ParentId: 'album-parent',
      }).albumId,
    ).toBe('album-parent')
    expect(
      mapBaseItem({
        Id: 'song',
        Name: 'Song',
        Type: 'Audio',
        ParentId: 'playlist-parent',
        PlaylistItemId: 'entry-1',
      }).albumId,
    ).toBeUndefined()
  })

  it('maps album and artist ids onto queue tracks', () => {
    const item = mapBaseItem({
      Id: 'song',
      Name: 'Song',
      Type: 'Audio',
      Album: 'Record',
      AlbumId: 'album-1',
      ArtistItems: [{ Id: 'artist-1', Name: 'Primary' }],
      AlbumArtists: [{ Id: 'album-artist', Name: 'Album Artist' }],
    })
    expect(item.albumId).toBe('album-1')
    expect(item.artistId).toBe('artist-1')
    expect(toQueueTrack(item).albumId).toBe('album-1')
    expect(toQueueTrack(item).artistId).toBe('artist-1')
  })

  it('falls back to album artists and empty media source', () => {
    const item = mapBaseItem({
      Id: '2',
      Name: 'Song',
      Type: 'Audio',
      AlbumArtists: [{ Id: 'aa1', Name: 'Album Artist' }],
      MediaSources: [],
    })
    expect(item.artists).toEqual(['Album Artist'])
    expect(item.artistId).toBe('aa1')
    expect(item.mediaSourceId).toBe('2')
    expect(item.imageTag).toBeUndefined()
    expect(mapBaseItem({}).name).toBe('Unknown')
    expect(
      mapBaseItem({
        Id: '3',
        Name: 'Song',
        Type: 'Audio',
        ArtistItems: [{ Id: 'a', Name: '' }],
        AlbumArtists: [{ Id: 'b', Name: 'Album Artist' }],
      }).artists,
    ).toEqual(['Album Artist'])
    expect(
      mapBaseItem({
        Id: '4',
        Name: 'Song',
        Type: 'Audio',
        ArtistItems: [{ Id: 'a' }],
        AlbumArtist: 'Solo Artist',
      }).artists,
    ).toEqual(['Solo Artist'])
    expect(
      mapBaseItem({
        Id: '5',
        Name: 'Song',
        Type: 'Audio',
        albumArtist: 'Camel Artist',
        albumArtists: [{ id: 'c', name: 'Camel Pair' }],
      }).artists,
    ).toEqual(['Camel Pair'])
  })

  it('builds artwork and stream urls', () => {
    const context = {
      serverUrl: 'https://jf',
      deviceId: 'd',
      accessToken: 't',
    } as JellyfinContext
    expect(artworkUrl(context, '1', 'tag')).toContain('Images/Primary')
    expect(artworkUrl(context, '1', 'tag')).toContain('maxHeight=2048')
    expect(artworkUrl(context, '1', 'tag')).toContain('maxWidth=2048')
    expect(artworkUrl(context, '1', 'tag')).toContain('quality=96')
    expect(artworkUrl(context, '1', 'tag')).toContain('tag=tag')
    expect(artworkUrl(context, '1', 'tag', 'thumb')).toContain('maxHeight=720')
    expect(artworkUrl(context, '1', 'tag', 'card')).toContain('maxHeight=960')
    expect(artworkUrl(context, '1')).toContain('Images/Primary')
    expect(artworkUrl(context, '1')).not.toContain('tag=')
    expect(artworkUrl(context, '')).toBeUndefined()
    expect(userImageUrl(context, 'u1')).toContain('/Users/u1/Images/Primary')
    expect(userImageUrl(context, 'u1', 'ptag', 'thumb')).toContain('tag=ptag')
    expect(userImageUrl(context, 'u1', undefined, 'thumb')).toContain('maxHeight=720')
    expect(userImageUrl(context, '')).toBeUndefined()
    expect(resizeArtworkUrl('https://jf/img?maxHeight=256&quality=90', 'hero')).toBe(
      'https://jf/img?maxWidth=2048&maxHeight=2048&quality=96',
    )
    expect(
      resizeArtworkUrl('https://jf/img?maxWidth=384&maxHeight=384&quality=90', 'hero'),
    ).toBe('https://jf/img?maxWidth=2048&maxHeight=2048&quality=96')
    expect(resizeArtworkUrl('https://jf/img?foo=1', 'hero')).toBe('https://jf/img?foo=1')
    expect(resizeArtworkUrl('file:///melio/art', 'hero')).toBe('file:///melio/art')
    expect(resizeArtworkUrl(undefined, 'hero')).toBeUndefined()
    expect(buildUniversalStreamUrl(context, '1', 'u')).toContain('UserId=u')
    expect(buildUniversalStreamUrl(context, '1', 'u')).toContain('/universal?')
    expect(buildUniversalStreamUrl(context, '1', 'u')).toContain('flac')
    expect(buildUniversalStreamUrl(context, '1', 'u')).toContain('opus')
    expect(buildAudioStreamUrl(context, '1', 'u')).toContain('/Audio/1/stream.mp3')
    expect(buildAudioStreamUrl(context, '1', 'u')).not.toContain('static=true')
    expect(audioAuthHeaders(context)?.['X-Emby-Token']).toBe('t')
    expect(
      audioAuthHeaders({ serverUrl: 'https://jf', deviceId: 'd' } as JellyfinContext),
    ).toBeUndefined()
    expect(
      buildUniversalStreamUrl(
        { serverUrl: 'https://jf', deviceId: 'd' } as JellyfinContext,
        '1',
        'u',
      ),
    ).not.toContain('api_key=')
    const candidates = buildPlaybackStreamCandidates(context, '1', 'u')
    expect(candidates.length).toBeGreaterThanOrEqual(3)
    expect(candidates[0]).toContain('/Audio/1/stream?')
    expect(candidates[0]).toContain('static=true')
    expect(candidates[0]).not.toContain('/stream.flac')
    expect(candidates[candidates.length - 2]).toContain('/universal?')
    expect(candidates[candidates.length - 1]).toContain('/stream.mp3')
    expect(candidates[candidates.length - 1]).not.toContain('static=true')
  })
})
