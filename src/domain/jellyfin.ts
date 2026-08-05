import { appError, err, ok, type Result } from '@/src/domain/result'

const trimTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value.slice(0, -1) : value

export type NormalizeServerUrlOptions = {
  readonly preferScheme?: 'http' | 'https'
}

export const normalizeServerUrl = (
  input: string,
  options: NormalizeServerUrlOptions = {},
): Result<string> => {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return err(appError('validation', 'Server URL is required'))
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return err(appError('validation', 'Only http and https URLs are supported'))
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${options.preferScheme ?? 'https'}://${trimmed}`

  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return err(appError('validation', 'Only http and https URLs are supported'))
    }
    if (!url.hostname) {
      return err(appError('validation', 'Server hostname is required'))
    }
    const normalized = trimTrailingSlash(`${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`)
    return ok(normalized)
  } catch {
    return err(appError('validation', 'Invalid server URL'))
  }
}

export const isInsecureHttpUrl = (serverUrl: string): boolean =>
  serverUrl.toLowerCase().startsWith('http://')

export const ticksToMs = (ticks: number): number => ticks / 10_000

export const msToTicks = (ms: number): number => Math.round(ms * 10_000)

export const positionTicksSatisfiesListen = (
  positionTicks: number,
  runtimeTicks: number,
): boolean => {
  const fourMinutes = msToTicks(4 * 60 * 1000)
  const halfRuntime = Math.floor(runtimeTicks / 2)
  return positionTicks >= fourMinutes || positionTicks >= halfRuntime
}
