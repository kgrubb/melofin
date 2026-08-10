import type { ExpoConfig, ConfigContext } from 'expo/config'

// CommonJS — Expo evaluates app.config without TS path resolution.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CARPLAY_ENABLED } = require('./features') as typeof import('./features')

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'kgrubb',
  name: 'Melio',
  slug: 'melio',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'melio',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.melio.player',
    infoPlist: {
      UIBackgroundModes: ['audio'],
      NSLocalNetworkUsageDescription:
        'Melio uses the local network to reach your Jellyfin server.',
      // Triggers the Local Network permission prompt on device.
      NSBonjourServices: ['_http._tcp.', '_jellyfin._tcp.'],
      // Jellyfin is user-hosted and often plain HTTP on LAN.
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSAllowsLocalNetworking: true,
      },
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
      backgroundColor: '#2A1240',
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
    'expo-router',
    'expo-secure-store',
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
    eas: {
      projectId: '402e26b5-7bf9-430f-a1b8-c03751cba89d',
      owner: 'kgrubb',
    },
  },
  updates: {
    enabled: false,
  },
})
