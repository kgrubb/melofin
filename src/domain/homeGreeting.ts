/** Morning 5-11, afternoon 12-16, else evening. */
export const homeGreeting = (now: Date): string => {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export const msUntilNextHomeGreeting = (now: Date): number => {
  const hour = now.getHours()
  const day = hour >= 17 ? 1 : 0
  const nextHour = hour < 5 ? 5 : hour < 12 ? 12 : hour < 17 ? 17 : 5
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + day,
    nextHour,
    0,
    0,
    0,
  )
  return Math.max(1, next.getTime() - now.getTime())
}
