import UIKit

class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let existing = appDelegate.window else { return }

    if existing.windowScene === windowScene {
      existing.makeKeyAndVisible()
      return
    }

    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = existing.rootViewController
    window.makeKeyAndVisible()
    appDelegate.window = window
  }
}
