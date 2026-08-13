import ExpoModulesCore

public class AirPlayRoutePickerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AirPlayRoutePicker")

    View(AirPlayRoutePickerView.self) {
      Prop("tintColor") { (view: AirPlayRoutePickerView, color: UIColor?) in
        view.tint = color
      }
      Prop("activeTintColor") { (view: AirPlayRoutePickerView, color: UIColor?) in
        view.activeTint = color
      }
      Prop("prioritizesVideoDevices") { (view: AirPlayRoutePickerView, value: Bool) in
        view.prioritizesVideoDevices = value
      }
      Events("onRouteChanged")
    }
  }
}
