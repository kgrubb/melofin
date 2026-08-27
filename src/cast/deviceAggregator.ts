import type { CastDevice, CastSinkKind } from '@/src/cast/types'
import { LOCAL_DEVICE_ID } from '@/src/cast/types'

const KIND_ORDER: Record<CastSinkKind, number> = {
  local: 0,
  chromecast: 1,
  jellyfin: 2,
  airplay: 3,
}

export const localDevice = (name: string): CastDevice => ({
  id: LOCAL_DEVICE_ID,
  name,
  kind: 'local',
  subtitle: 'This device',
})

/** Merge provider lists: This phone first, then by kind, then name. Dedupes by id. */
export const aggregateDevices = (
  local: CastDevice,
  groups: readonly (readonly CastDevice[])[],
): readonly CastDevice[] => {
  const seen = new Set<string>([local.id])
  const rest = groups
    .flat()
    .filter((device) => {
      if (device.kind === 'local' || seen.has(device.id)) return false
      seen.add(device.id)
      return true
    })
    .toSorted((a, b) => {
      const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      if (kind !== 0) return kind
      return a.name.localeCompare(b.name)
    })
  return [local, ...rest]
}

export type SessionLike = {
  readonly Id?: string | null
  readonly DeviceId?: string | null
  readonly DeviceName?: string | null
  readonly Client?: string | null
  readonly UserId?: string | null
  readonly SupportsRemoteControl?: boolean | null
  readonly PlayableMediaTypes?: readonly string[] | null
  readonly LastActivityDate?: string | null
}

export const filterJellyfinSessions = (
  sessions: readonly SessionLike[],
  selfDeviceId: string,
  userId: string,
  nowMs = Date.now(),
  maxAgeMs = 5 * 60_000,
): readonly CastDevice[] =>
  sessions
    .filter((session) => {
      if (!session.Id) return false
      if (session.UserId && session.UserId !== userId) return false
      if (session.DeviceId && session.DeviceId === selfDeviceId) return false
      if (!session.SupportsRemoteControl) return false
      const types = session.PlayableMediaTypes ?? []
      if (types.length > 0 && !types.some((t) => t.toLowerCase() === 'audio')) {
        return false
      }
      if (session.LastActivityDate) {
        const age = nowMs - Date.parse(session.LastActivityDate)
        if (Number.isFinite(age) && age > maxAgeMs) return false
      }
      return true
    })
    .map((session) => ({
      id: `jellyfin:${session.Id}`,
      name: session.DeviceName || session.Client || 'Jellyfin device',
      kind: 'jellyfin' as const,
      subtitle: session.Client ?? 'Jellyfin',
    }))
