import { stateRef } from '@/src/player/engineState'

export const clearNativeNextQueue = (): void => {
  stateRef.handoffActive = false
  stateRef.handoffForKey = null
}
