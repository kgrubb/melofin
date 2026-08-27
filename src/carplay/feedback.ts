import { logger } from '@/src/logging/logger'

/**
 * Log only. AlertTemplate present/dismiss can blank the CarPlay Audio root.
 */
export const presentCarPlayNotice = (title: string): void => {
  logger.warn('CarPlay notice', { title })
}
