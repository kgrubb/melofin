import { describe, expect, it } from 'vitest'
import {
  planAudioInterruptAction,
  planAudioRouteAction,
} from '@/src/domain/audioRoute'

describe('audioRoute', () => {
  it('pauses when USB/car/headphones disappear', () => {
    expect(
      planAudioRouteAction({
        reason: 'categoryChange',
        previousPorts: ['usb'],
        currentPorts: ['Speaker'],
        isPlaying: true,
        pausedForRouteLoss: false,
      }),
    ).toBe('pause')
    expect(
      planAudioRouteAction({
        reason: 'oldDeviceUnavailable',
        previousPorts: [],
        currentPorts: ['Speaker'],
        isPlaying: true,
        pausedForRouteLoss: false,
      }),
    ).toBe('pause')
    expect(
      planAudioRouteAction({
        reason: 'oldDeviceUnavailable',
        previousPorts: ['headphones'],
        currentPorts: ['Speaker'],
        isPlaying: false,
        pausedForRouteLoss: false,
      }),
    ).toBe('none')
  })

  it('resumes USB/car reattach only after a route-loss pause', () => {
    expect(
      planAudioRouteAction({
        reason: 'newDeviceAvailable',
        previousPorts: ['Speaker'],
        currentPorts: ['car'],
        isPlaying: false,
        pausedForRouteLoss: true,
      }),
    ).toBe('resume')
    expect(
      planAudioRouteAction({
        reason: 'newDeviceAvailable',
        previousPorts: ['Speaker'],
        currentPorts: ['headphones'],
        isPlaying: false,
        pausedForRouteLoss: true,
      }),
    ).toBe('none')
    expect(
      planAudioRouteAction({
        reason: 'newDeviceAvailable',
        previousPorts: ['Speaker'],
        currentPorts: ['usb'],
        isPlaying: false,
        pausedForRouteLoss: false,
      }),
    ).toBe('none')
  })

  it('resumes interruptions for USB attach without shouldResume', () => {
    expect(
      planAudioInterruptAction({
        type: 'began',
        shouldResume: false,
        currentPorts: ['Speaker'],
        isPlaying: true,
        pausedForRouteLoss: false,
      }),
    ).toBe('pause')
    expect(
      planAudioInterruptAction({
        type: 'ended',
        shouldResume: true,
        currentPorts: ['Speaker'],
        isPlaying: false,
        pausedForRouteLoss: true,
      }),
    ).toBe('resume')
    expect(
      planAudioInterruptAction({
        type: 'ended',
        shouldResume: false,
        currentPorts: ['usb'],
        isPlaying: false,
        pausedForRouteLoss: true,
      }),
    ).toBe('resume')
    expect(
      planAudioInterruptAction({
        type: 'ended',
        shouldResume: true,
        currentPorts: ['Speaker'],
        isPlaying: false,
        pausedForRouteLoss: false,
      }),
    ).toBe('none')
    expect(
      planAudioInterruptAction({
        type: 'ended',
        shouldResume: false,
        currentPorts: ['Speaker'],
        isPlaying: false,
        pausedForRouteLoss: true,
      }),
    ).toBe('none')
  })
})
