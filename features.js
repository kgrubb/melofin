/**
 * Feature flags for Expo config / native entitlements.
 * Edit features.json (single source of truth).
 *
 * CarPlay: set CARPLAY_ENABLED to true after Apple Developer Program +
 * CarPlay Audio entitlement, then `npx expo prebuild --platform ios`.
 */
module.exports = require('./features.json')
