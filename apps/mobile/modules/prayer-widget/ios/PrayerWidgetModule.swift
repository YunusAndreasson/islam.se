import ExpoModulesCore
import WidgetKit

public final class PrayerWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PrayerWidgetPlacement")
    AsyncFunction("snapshot") { (promise: Promise) in
      WidgetCenter.shared.getCurrentConfigurations { result in
        switch result {
        case .success(let widgets):
          let present = widgets.contains { $0.kind == "PrayerTimesWidget" }
          promise.resolve(["present": present, "receipts": []] as [String: Any])
        case .failure(let error):
          promise.reject("WIDGET_QUERY_FAILED", error.localizedDescription)
        }
      }
    }
  }
}
