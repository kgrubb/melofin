import { AppState, type NativeEventSubscription } from 'react-native'
import { shouldFireDeadline } from '@/src/domain/sleepTimer'
import { usePlayerStore } from '@/src/store/player'

let appSub: NativeEventSubscription | null = null
let interval: ReturnType<typeof setInterval> | null = null

const fireIfDue = () => {
  const store = usePlayerStore.getState()
  if (!shouldFireDeadline(store.sleep, Date.now())) return
  store.clearSleep()
  store.setPlaying(false)
}

/** Poll only while a wall-clock sleep deadline is armed (not end-of-track). */
export const syncSleepWatch = (): void => {
  const needsWatch = usePlayerStore.getState().sleep.deadlineMs !== null
  if (needsWatch) {
    if (!appSub) {
      appSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') fireIfDue()
      })
    }
    if (!interval) interval = setInterval(fireIfDue, 1000)
    fireIfDue()
    return
  }
  appSub?.remove()
  appSub = null
  if (interval) {
    clearInterval(interval)
    interval = null
  }
}
