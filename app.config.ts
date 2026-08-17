import type { ExpoConfig, ConfigContext } from 'expo/config'

// CommonJS. Expo evaluates app.config without TS path resolution.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CARPLAY_ENABLED } = require('./features') as typeof import('./features')

const isProductionBuild = process.env.EAS_BUILD_PROFILE === 'production'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'kgrubb',
  name: 'Melio',
  slug: 'melio',
  version: '1.0.0', // x-release-please-version
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'melio',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.melio.player',
    buildNumber: '1',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['audio'],
      NSLocalNetworkUsageDescription:
        'Melio uses the local network to reach your Jellyfin server and find Cast or AirPlay speakers.',
      // Triggers the Local Network permission prompt on device.
      NSBonjourServices: [
        ...(isProductionBuild ? [] : ['_expo._tcp']),
        '_http._tcp.',
        '_jellyfin._tcp.',
        '_googlecast._tcp.',
        '_CC1AD845._googlecast._tcp.',
      ],
      AVInitialRouteSharingPolicy: 'LongFormAudio',
      // User-hosted Jellyfin is often HTTP on a LAN or a hostname that is not
      // `.local`. ATS cannot enumerate those hosts, so insecure HTTP stays an
      // opt-in (server screen defaults to HTTPS).
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSAllowsLocalNetworking: true,
      },
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1', '7D9E.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
      ],
    },
    entitlements: CARPLAY_ENABLED
      ? {
          'com.apple.developer.carplay-audio': true,
        }
      : {},
  },
  android: {
    package: 'app.melio.player',
    adaptiveIcon: {
      backgroundColor: '#9333EA',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-sqlite',
    'expo-router',
    'expo-secure-store',
    'react-native-google-cast',
    './plugins/withPinnedGoogleCast.js',
    [
      'expo-audio',
      {
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0B0614',
      },
    ],
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '16.4',
        },
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
    ...(CARPLAY_ENABLED ? ['./plugins/withCarPlayAudio.js'] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    carPlayEnabled: CARPLAY_ENABLED,
    privacyPolicyUrl: 'https://github.com/kgrubb/melio/blob/main/PRIVACY.md',
    eas: {
      projectId: '402e26b5-7bf9-430f-a1b8-c03751cba89d',
      owner: 'kgrubb',
    },
  },
  updates: {
    enabled: false,
  },
})
