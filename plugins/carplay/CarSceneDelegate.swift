import UIKit
import CarPlay

class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  func templateApplicationScene(
    _ scene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    RNCarPlay.connect(with: interfaceController, window: scene.carWindow)
  }

  func templateApplicationScene(
    _ scene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    RNCarPlay.disconnect()
  }
}
