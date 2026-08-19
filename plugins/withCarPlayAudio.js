const {
  withEntitlementsPlist,
  withInfoPlist,
  createRunOncePlugin,
} = require('expo/config-plugins')

const withCarPlayAudio = (config) => {
  const withEntitlements = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.carplay-audio'] = true
    return mod
  })

  return withInfoPlist(withEntitlements, (mod) => {
    const modes = mod.modResults.UIBackgroundModes ?? []
    mod.modResults.UIBackgroundModes = modes.includes('audio')
      ? modes
      : [...modes, 'audio']
    mod.modResults.NSLocalNetworkUsageDescription =
      mod.modResults.NSLocalNetworkUsageDescription ??
      'Melofin uses the local network to find Jellyfin servers.'
    return mod
  })
}

module.exports = createRunOncePlugin(withCarPlayAudio, 'with-carplay-audio', '1.0.0')
