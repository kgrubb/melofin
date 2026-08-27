import { AppState, type NativeEventSubscription } from 'react-native'
import { shouldFireDeadline } from '@/src/domain/sleepTimer'
import { usePlayerStore } from '@/src/store/player'

type SleepWatch = {
  readonly appSub: NativeEventSubscription | null
  readonly interval: ReturnType<typeof setInterval> | null
}

let watch: SleepWatch = { appSub: null, interval: null }

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
    const appSub =
      watch.appSub ??
      AppState.addEventListener('change', (state) => {
        if (state === 'active') fireIfDue()
      })
    const interval = watch.interval ?? setInterval(fireIfDue, 1000)
    watch = { appSub, interval }
    fireIfDue()
    return
  }
  watch.appSub?.remove()
  if (watch.interval) clearInterval(watch.interval)
  watch = { appSub: null, interval: null }
}
