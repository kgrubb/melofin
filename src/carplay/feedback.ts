import { AlertTemplate, CarPlay } from 'react-native-carplay'
import { carplay } from '@/src/i18n/carplayCopy'
import { logger } from '@/src/logging/logger'

/** Brief in-car notice so silent failures do not read as a broken UI. */
export const presentCarPlayNotice = (title: string): void => {
  try {
    const alert = new AlertTemplate({
      titleVariants: [title],
      actions: [{ id: 'ok', title: carplay.dismiss() }],
      onActionButtonPressed: () => {
        CarPlay.dismissTemplate(true)
      },
    })
    CarPlay.presentTemplate(alert, true)
  } catch (cause) {
    logger.warn('CarPlay notice failed', { cause, title })
  }
}
