import {
  planAudioInterruptAction,
  planAudioRouteAction,
} from '@/src/domain/audioRoute'
import { logger } from '@/src/logging/logger'
import { subscribeAudioSession } from 'melofin-audio-graph'

export type AudioSessionBridgeHandlers = {
  readonly isPlaying: () => boolean
  readonly pausedForRouteLoss: () => boolean
  readonly pauseForRouteLoss: () => void
  readonly resumeAfterRoute: () => void
}

const RESUME_DEBOUNCE_MS = 350

/** Pause on wired unplug / interrupt; resume USB/car after the route settles. */
export const startAudioSessionBridge = (
  handlers: AudioSessionBridgeHandlers,
): (() => void) => {
  let resumeTimer: ReturnType<typeof setTimeout> | null = null

  const clearResume = () => {
    if (!resumeTimer) return
    clearTimeout(resumeTimer)
    resumeTimer = null
  }

  const requestPause = (fields: {
    readonly source: string
    readonly reason?: string
    readonly ports?: readonly string[]
  }) => {
    clearResume()
    logger.info('audio.route_pause', fields)
    handlers.pauseForRouteLoss()
  }

  const requestResume = (fields: {
    readonly source: string
    readonly ports?: readonly string[]
  }) => {
    clearResume()
    resumeTimer = setTimeout(() => {
      resumeTimer = null
      logger.info('audio.route_resume', fields)
      handlers.resumeAfterRoute()
    }, RESUME_DEBOUNCE_MS)
  }

  const stop = subscribeAudioSession(
    (event) => {
      const action = planAudioRouteAction({
        reason: event.reason,
        previousPorts: event.previousPorts,
        currentPorts: event.currentPorts,
        isPlaying: handlers.isPlaying(),
        pausedForRouteLoss: handlers.pausedForRouteLoss(),
      })
      if (action === 'pause') {
        requestPause({
          source: 'route',
          reason: event.reason,
          ports: event.currentPorts,
        })
      }
      if (action === 'resume') {
        requestResume({ source: 'route', ports: event.currentPorts })
      }
    },
    (event) => {
      const action = planAudioInterruptAction({
        type: event.type,
        shouldResume: event.shouldResume,
        currentPorts: event.currentPorts,
        isPlaying: handlers.isPlaying(),
        pausedForRouteLoss: handlers.pausedForRouteLoss(),
      })
      if (action === 'pause') {
        requestPause({ source: 'interruption', ports: event.currentPorts })
      }
      if (action === 'resume') {
        requestResume({ source: 'interruption', ports: event.currentPorts })
      }
    },
  )

  return () => {
    clearResume()
    stop()
  }
}
