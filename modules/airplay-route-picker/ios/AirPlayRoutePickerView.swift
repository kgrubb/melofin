import AVKit
import ExpoModulesCore
import MediaPlayer

public class AirPlayRoutePickerView: ExpoView {
  let routePicker = AVRoutePickerView()
  let onRouteChanged = EventDispatcher()

  var tint: UIColor? {
    didSet { routePicker.tintColor = tint }
  }

  var activeTint: UIColor? {
    didSet { routePicker.activeTintColor = activeTint }
  }

  var prioritizesVideoDevices = false {
    didSet { routePicker.prioritizesVideoDevices = prioritizesVideoDevices }
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    routePicker.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    routePicker.prioritizesVideoDevices = false
    addSubview(routePicker)

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(routeChanged),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
    emitRoute()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    routePicker.frame = bounds
  }

  @objc private func routeChanged() {
    emitRoute()
  }

  private func emitRoute() {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    let external = outputs.first(where: isExternalOutput)
    let routeName: Any = external?.portName ?? NSNull()
    onRouteChanged(["routeName": routeName])
  }

  private func isExternalOutput(_ output: AVAudioSessionPortDescription) -> Bool {
    switch output.portType {
    case .airPlay, .bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .HDMI:
      return true
    default:
      return false
    }
  }
}
