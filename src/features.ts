import flags from '../features.json'

/** Mirror of features.json — flip there, then rebuild native if entitlements change. */
export const CARPLAY_ENABLED: boolean = flags.CARPLAY_ENABLED
