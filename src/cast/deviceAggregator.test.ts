import { describe, expect, it } from 'vitest'
import {
  aggregateDevices,
  filterJellyfinSessions,
  localDevice,
} from '@/src/cast/deviceAggregator'

describe('deviceAggregator', () => {
  it('puts local first and sorts by kind then name', () => {
    const list = aggregateDevices(localDevice('Phone'), [
      [
        { id: 'j2', name: 'Zebra', kind: 'jellyfin' },
        { id: 'c1', name: 'Nest', kind: 'chromecast' },
        { id: 'j1', name: 'Apple TV JF', kind: 'jellyfin' },
        { id: 'local', name: 'dup', kind: 'local' },
        { id: 'c1', name: 'Nest dup', kind: 'chromecast' },
      ],
    ])
    expect(list.map((d) => d.id)).toEqual(['local', 'c1', 'j1', 'j2'])
  })

  it('filters jellyfin sessions', () => {
    const now = Date.parse('2026-01-01T12:00:00Z')
    const devices = filterJellyfinSessions(
      [
        {
          Id: '1',
          DeviceId: 'self',
          UserId: 'u',
          SupportsRemoteControl: true,
          PlayableMediaTypes: ['Audio'],
        },
        {
          Id: '2',
          DeviceId: 'tv',
          DeviceName: 'Living TV',
          Client: 'Android TV',
          UserId: 'u',
          SupportsRemoteControl: true,
          PlayableMediaTypes: ['Audio', 'Video'],
          LastActivityDate: '2026-01-01T11:59:00Z',
        },
        {
          Id: '3',
          DeviceId: 'other',
          UserId: 'other-user',
          SupportsRemoteControl: true,
          PlayableMediaTypes: ['Audio'],
        },
        {
          Id: '4',
          DeviceId: 'stale',
          UserId: 'u',
          SupportsRemoteControl: true,
          PlayableMediaTypes: ['Audio'],
          LastActivityDate: '2026-01-01T10:00:00Z',
        },
        {
          Id: '5',
          DeviceId: 'video-only',
          UserId: 'u',
          SupportsRemoteControl: true,
          PlayableMediaTypes: ['Video'],
        },
      ],
      'self',
      'u',
      now,
    )
    expect(devices).toHaveLength(1)
    expect(devices[0]?.id).toBe('jellyfin:2')
    expect(devices[0]?.name).toBe('Living TV')
  })
})
