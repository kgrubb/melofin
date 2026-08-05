/** Human playlist/album runtime, e.g. `2h 54m` or `42m`. */
export const formatCollectionDuration = (ms: number): string => {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${totalSec}s`
}
