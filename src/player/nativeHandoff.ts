import { melofinAudioGraph } from 'melofin-audio-graph'
import { stateRef } from '@/src/player/engineState'

/** Stop secondary handoff player and clear handoff bookkeeping. */
export const clearNativeNextQueue = (): void => {
  stateRef.handoffActive = false
  stateRef.handoffForKey = null
  melofinAudioGraph.clearNext()
}
