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
const phoneSceneDelegate = fs.readFileSync(
  path.join(__dirname, 'carplay/PhoneSceneDelegate.swift'),
  'utf8',
)

const sceneManifest = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneClassName: 'UIWindowScene',
        UISceneConfigurationName: 'Default',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).PhoneSceneDelegate',
      },
    ],
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
  @objc public func application(
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
    } else {
      configuration.delegateClass = PhoneSceneDelegate.self
    }
    return configuration
  }
`

const withCarPlayAudio = (config) => {
  const withEntitlement = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.carplay-audio'] = true
    return mod
  })

  const withModes = withInfoPlist(withEntitlement, (mod) => {
    const modes = mod.modResults.UIBackgroundModes ?? []
    mod.modResults.UIBackgroundModes = modes.includes('audio')
      ? modes
      : [...modes, 'audio']
    mod.modResults.UIApplicationSceneManifest = sceneManifest
    return mod
  })

  const withCarDelegate = withBuildSourceFile(withModes, {
    filePath: 'CarSceneDelegate.swift',
    contents: carSceneDelegate,
    overwrite: true,
  })

  const withPhoneDelegate = withBuildSourceFile(withCarDelegate, {
    filePath: 'PhoneSceneDelegate.swift',
    contents: phoneSceneDelegate,
    overwrite: true,
  })

  return withDangerousMod(withPhoneDelegate, [
    'ios',
    async (mod) => {
      const root = mod.modRequest.platformProjectRoot
      const appName = mod.modRequest.projectName ?? 'Melofin'
      const appDelegate = path.join(root, appName, 'AppDelegate.swift')
      const bridging = path.join(root, appName, `${appName}-Bridging-Header.h`)
      if (fs.existsSync(appDelegate)) {
        const raw = fs.readFileSync(appDelegate, 'utf8')
        if (!raw.includes('configurationForConnecting')) {
          // SDK 57 AppDelegate uses `internal import Expo`. Keep CarPlay on the
          // same access level so Swift does not error on ambiguous imports.
          const withImport = /import CarPlay\b/.test(raw)
            ? raw
            : raw.replace(
                /^(internal )?import Expo$/m,
                (_match, access) =>
                  `${access || ''}import CarPlay\n${access || ''}import Expo`,
              )
          // Insert inside AppDelegate, before its closing brace (not after it).
          const contents = withImport.replace(
            '\n}\n\nclass ReactNativeDelegate:',
            `${sceneConfigMethod}\n}\n\nclass ReactNativeDelegate:`,
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
}

module.exports = createRunOncePlugin(withCarPlayAudio, 'with-carplay-audio', '2.2.0')
