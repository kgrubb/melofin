import { Directory, File, Paths } from 'expo-file-system'
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
    const file = new File(Paths.document, 'melio', relativePath)
    file.create({ intermediates: true, overwrite: true })
    file.write(JSON.stringify(value))
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
