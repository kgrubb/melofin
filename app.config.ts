import type { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
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
        'Melio uses the local network to find Jellyfin servers.',
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true,
        NSExceptionDomains: {
          localhost: {
            NSExceptionAllowsInsecureHTTPLoads: true,
            NSIncludesSubdomains: true,
          },
        },
      },
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: true,
        UISceneConfigurations: {
          CPTemplateApplicationSceneSessionRoleApplication: [
            {
              UISceneConfigurationName: 'CarPlay',
              UISceneDelegateClassName: 'RNCPStore',
            },
          ],
        },
      },
    },
    entitlements: {
      'com.apple.developer.carplay-audio': true,
    },
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
    'expo-image',
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
    eas: {
      projectId: 'melio-placeholder',
    },
  },
  updates: {
    enabled: false,
  },
})
