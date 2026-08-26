import { logger } from '@/src/logging/logger'

/**
 * CarPlay Audio roots are fragile around AlertTemplate present/dismiss.
 * Log the failure so actions stay on the TabBar instead of blanking the scene.
 */
export const presentCarPlayNotice = (title: string): void => {
  logger.warn('CarPlay notice', { title })
}
