export type DownloadScheduler = {
  readonly enqueue: <T>(task: () => Promise<T>) => Promise<T>
  readonly pending: () => number
  readonly active: () => number
  readonly pause: () => void
  readonly resume: () => void
}

/** Limits how many download tasks run at once. FIFO for the rest. */
export const createDownloadScheduler = (concurrency: number): DownloadScheduler => {
  const limit = Math.max(1, Math.floor(concurrency))
  const waiting: (() => void)[] = []
  const slots = { running: 0, paused: false }

  const pump = () => {
    if (slots.paused) return
    while (slots.running < limit && waiting.length > 0) {
      const next = waiting.shift()
      next?.()
    }
  }

  return {
    pending: () => waiting.length,
    active: () => slots.running,
    pause: () => {
      slots.paused = true
    },
    resume: () => {
      slots.paused = false
      pump()
    },
    enqueue: <T>(task: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const run = () => {
          slots.running += 1
          task().then(
            (value) => {
              slots.running -= 1
              resolve(value)
              pump()
            },
            (cause) => {
              slots.running -= 1
              reject(cause)
              pump()
            },
          )
        }
        waiting.push(run)
        pump()
      }),
  }
}
