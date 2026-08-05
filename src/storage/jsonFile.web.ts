import { appError, err, ok, type Result } from '@/src/domain/result'

const key = (relativePath: string) => `melio.fs.${relativePath}`

/** Browser preview: JSON settings/index via localStorage. No real audio files. */
export const ensureDir = async (_relativePath = ''): Promise<Result<string>> =>
  ok('web://melio')

export const readJsonFile = async <T>(
  relativePath: string,
): Promise<Result<T | null>> => {
  try {
    if (typeof localStorage === 'undefined') return ok(null)
    const raw = localStorage.getItem(key(relativePath))
    if (!raw) return ok(null)
    return ok(JSON.parse(raw) as T)
  } catch (cause) {
    return err(appError('storage', 'Unable to read JSON file', cause))
  }
}

export const writeJsonFile = async (
  relativePath: string,
  value: unknown,
): Promise<Result<void>> => {
  try {
    if (typeof localStorage === 'undefined') {
      return err(appError('storage', 'localStorage unavailable'))
    }
    localStorage.setItem(key(relativePath), JSON.stringify(value))
    return ok(undefined)
  } catch (cause) {
    return err(appError('storage', 'Unable to write JSON file', cause))
  }
}

export const deleteFile = async (_uri: string): Promise<Result<void>> =>
  ok(undefined)

export const audioFilePath = (itemId: string): string => `web://melio/audio/${itemId}`
