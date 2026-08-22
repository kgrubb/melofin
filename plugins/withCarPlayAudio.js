const {
  withEntitlementsPlist,
  withInfoPlist,
  createRunOncePlugin,
  withDangerousMod,
} = require('expo/config-plugins')
const { withBuildSourceFile } = require('@expo/config-plugins/build/ios/XcodeProjectFile')
const fs = require('node:fs')
const path = require('node:path')

const carSceneDelegate = fs.readFileSync(
  path.join(__dirname, 'carplay/CarSceneDelegate.swift'),
  'utf8',
)

const sceneManifest = {
  UIApplicationSupportsMultipleScenes: true,
  UISceneConfigurations: {
    CPTemplateApplicationSceneSessionRoleApplication: [
      {
        UISceneClassName: 'CPTemplateApplicationScene',
        UISceneConfigurationName: 'CarPlay',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CarSceneDelegate',
      },
    ],
  },
}

const sceneConfigMethod = `
  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: connectingSceneSession.role == .carTemplateApplication ? "CarPlay" : "Default",
      sessionRole: connectingSceneSession.role
    )
    if connectingSceneSession.role == .carTemplateApplication {
      configuration.delegateClass = CarSceneDelegate.self
    }
    return configuration
  }
`

const withCarPlayAudio = (config) => {
  let next = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.carplay-audio'] = true
    return mod
  })

  next = withInfoPlist(next, (mod) => {
    const modes = mod.modResults.UIBackgroundModes ?? []
    mod.modResults.UIBackgroundModes = modes.includes('audio')
      ? modes
      : [...modes, 'audio']
    mod.modResults.UIApplicationSceneManifest = sceneManifest
    return mod
  })

  next = withBuildSourceFile(next, {
    filePath: 'CarSceneDelegate.swift',
    contents: carSceneDelegate,
    overwrite: true,
  })

  next = withDangerousMod(next, [
    'ios',
    async (mod) => {
      const root = mod.modRequest.platformProjectRoot
      const appDelegate = path.join(root, 'Melio', 'AppDelegate.swift')
      const bridging = path.join(root, 'Melio', 'Melio-Bridging-Header.h')
      if (fs.existsSync(appDelegate)) {
        let contents = fs.readFileSync(appDelegate, 'utf8')
        if (!contents.includes('configurationForConnecting')) {
          if (!contents.includes('import CarPlay')) {
            contents = contents.replace('import Expo', 'import CarPlay\nimport Expo')
          }
          contents = contents.replace(
            '\nclass ReactNativeDelegate:',
            `${sceneConfigMethod}\n\nclass ReactNativeDelegate:`,
          )
          fs.writeFileSync(appDelegate, contents)
        }
      }
      if (fs.existsSync(bridging) && !fs.readFileSync(bridging, 'utf8').includes('RNCarPlay.h')) {
        fs.appendFileSync(bridging, '#import "RNCarPlay.h"\n')
      }
      return mod
    },
  ])

  return next
}

module.exports = createRunOncePlugin(withCarPlayAudio, 'with-carplay-audio', '2.0.0')
