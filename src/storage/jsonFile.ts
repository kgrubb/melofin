import { Directory, File, Paths } from 'expo-file-system'
import { resolveOfflineFileUri as resolveOfflinePath } from '@/src/domain/offline'
import { appError, err, ok, type Result } from '@/src/domain/result'
import { logger } from '@/src/logging/logger'

const rootDir = () => new Directory(Paths.document, 'melio')

export const ensureDir = async (relativePath = ''): Promise<Result<string>> => {
  try {
    const dir =
      relativePath.length === 0
        ? rootDir()
        : new Directory(Paths.document, 'melio', relativePath)
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true })
    }
    return ok(dir.uri)
  } catch (cause) {
    logger.error('Failed to ensure directory', { cause })
    return err(appError('storage', 'Unable to create storage directory', cause))
  }
}

export const readJsonFile = async <T>(
  relativePath: string,
): Promise<Result<T | null>> => {
  const dirResult = await ensureDir()
  if (!dirResult.ok) return dirResult
  try {
    const file = new File(Paths.document, 'melio', relativePath)
    if (!file.exists) return ok(null)
    const raw = await file.text()
    return ok(JSON.parse(raw) as T)
  } catch (cause) {
    logger.error('Failed to read JSON file', { cause })
    return err(appError('storage', 'Unable to read JSON file', cause))
  }
}

export const writeJsonFile = async (
  relativePath: string,
  value: unknown,
): Promise<Result<void>> => {
  const dirResult = await ensureDir()
  if (!dirResult.ok) return dirResult
  try {
    const payload = JSON.stringify(value)
    const temp = new File(Paths.document, 'melio', `${relativePath}.tmp`)
    temp.create({ intermediates: true, overwrite: true })
    temp.write(payload)
    const target = new File(Paths.document, 'melio', relativePath)
    if (target.exists) {
      target.delete()
    }
    temp.move(target)
    return ok(undefined)
  } catch (cause) {
    logger.error('Failed to write JSON file', { cause })
    return err(appError('storage', 'Unable to write JSON file', cause))
  }
}

export const deleteFile = async (uri: string): Promise<Result<void>> => {
  try {
    const file = new File(uri)
    if (file.exists) {
      file.delete()
    }
    return ok(undefined)
  } catch (cause) {
    return err(appError('storage', 'Unable to delete file', cause))
  }
}

export const audioFilePath = (itemId: string): string =>
  new File(Paths.document, 'melio', 'audio', itemId).uri

export const melioRootUri = (): string => rootDir().uri

/** Sync existence check for a playable offline URI (file:// or absolute). */
export const offlineAudioExists = (uri: string): boolean => {
  try {
    return new File(uri).exists
  } catch {
    return false
  }
}

/** Resolve a stored offline path (relative under melio/ or legacy absolute) to a file URI. */
export const resolveOfflineFileUri = (path: string): string =>
  resolveOfflinePath(path, melioRootUri())

export const deleteAudioCacheDir = async (): Promise<Result<void>> => {
  try {
    const dir = new Directory(Paths.document, 'melio', 'audio')
    if (dir.exists) {
      dir.delete()
    }
    return ok(undefined)
  } catch (cause) {
    return err(appError('storage', 'Unable to clear audio cache', cause))
  }
}
