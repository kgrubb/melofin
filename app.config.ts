import type { ExpoConfig, ConfigContext } from 'expo/config'

const isProductionBuild = process.env.EAS_BUILD_PROFILE === 'production'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'kgrubb',
  name: 'Melofin',
  slug: 'melofin',
  version: '1.0.0', // x-release-please-version
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'melofin',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.melofin.player',
    buildNumber: '1',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['audio'],
      NSLocalNetworkUsageDescription:
        'Melofin uses the local network to reach your Jellyfin server and find Cast or AirPlay speakers.',
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
    entitlements: {
      'com.apple.developer.carplay-audio': true,
    },
  },
  android: {
    package: 'app.melofin.player',
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
    'expo-localization',
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
    './plugins/withCarPlayAudio.js',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    privacyPolicyUrl: 'https://github.com/kgrubb/melofin/blob/main/PRIVACY.md',
    sourceUrl: 'https://github.com/kgrubb/melofin',
    eas: {
      projectId: '5db5fbc6-9c2e-4713-9d27-a35a09052a10',
      owner: 'kgrubb',
    },
  },
  updates: {
    enabled: false,
  },
})
