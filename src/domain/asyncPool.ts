/** Bounded concurrency. Results stay in input order. */
export const mapPool = async <T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  options?: {
    /** When false, skip remaining items (in-flight work still finishes). */
    readonly shouldContinue?: () => boolean
  },
): Promise<readonly R[]> => {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length))
  const results = new Array<R>(items.length)
  const cursor = { index: 0 }
  const shouldContinue = options?.shouldContinue
  await Promise.all(
    Array.from({ length: limit }, async () => {
      for (;;) {
        if (shouldContinue && !shouldContinue()) return
        const index = cursor.index
        cursor.index += 1
        if (index >= items.length) return
        results[index] = await fn(items[index]!, index)
      }
    }),
  )
  return results
}
