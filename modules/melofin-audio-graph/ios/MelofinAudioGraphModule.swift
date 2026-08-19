import AVFoundation
import ExpoModulesCore

/// Secondary AVPlayer for gapless / crossfade, plus session route events.
public final class MelofinAudioGraphModule: Module {
  private var nextPlayer: AVPlayer?
  private var fadeTimer: Timer?
  private let lock = NSLock()
  private var routeObserver: NSObjectProtocol?
  private var interruptObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("MelofinAudioGraph")

    Events("onAudioRoute", "onAudioInterruption")

    OnCreate {
      self.startSessionObservers()
    }

    OnDestroy {
      self.stopSessionObservers()
      self.tearDownNext()
    }

    Function("isAvailable") { () -> Bool in true }

    AsyncFunction("setNextUri") { (uri: String, headers: [String: String]?) -> Bool in
      guard let url = URL(string: uri) else { return false }
      _ = headers
      self.tearDownNext()

      let item = AVPlayerItem(url: url)
      let player = AVPlayer(playerItem: item)
      await MainActor.run {
        player.volume = 0
        player.automaticallyWaitsToMinimizeStalling = true
      }
      _ = await Self.waitUntilReady(item: item, timeoutSec: 2)
      self.setNext(player)
      MelofinEq.shared().attach(to: player)
      return item.status == .readyToPlay
    }

    Function("clearNext") { self.tearDownNext() }

    AsyncFunction("playNextImmediate") { (volume: Double) -> Bool in
      guard let player = self.currentNext(),
            let item = player.currentItem,
            item.status == .readyToPlay else {
        return false
      }
      await MainActor.run {
        self.fadeTimer?.invalidate()
        self.fadeTimer = nil
        player.volume = Float(max(0, min(1, volume)))
        player.play()
      }
      return true
    }

    AsyncFunction("crossfadeToNext") { (durationSec: Double) -> Bool in
      guard let player = self.currentNext(),
            let item = player.currentItem,
            item.status == .readyToPlay else {
        return false
      }

      let duration = max(0.05, durationSec)
      let steps = max(8, Int(duration * 20))
      let stepDuration = duration / Double(steps)

      await MainActor.run {
        self.fadeTimer?.invalidate()
        self.fadeTimer = nil
        player.volume = 0
        player.play()
        var step = 0
        self.fadeTimer = Timer.scheduledTimer(withTimeInterval: stepDuration, repeats: true) { timer in
          step += 1
          player.volume = Float(min(1, Double(step) / Double(steps)))
          if step >= steps {
            timer.invalidate()
          }
        }
      }
      return true
    }

    Function("handoffPositionSec") { () -> Double in
      guard let player = self.currentNext() else { return 0 }
      let seconds = player.currentTime().seconds
      return seconds.isFinite ? seconds : 0
    }

    Function("setEqGains") { (gainsDb: [Double]) in
      MelofinEq.shared().setGainsDb(gainsDb.map { NSNumber(value: $0) })
    }
    Function("resetEq") {
      MelofinEq.shared().reset()
    }
  }

  private func currentNext() -> AVPlayer? {
    lock.lock()
    defer { lock.unlock() }
    return nextPlayer
  }

  private func setNext(_ player: AVPlayer?) {
    lock.lock()
    nextPlayer = player
    lock.unlock()
  }

  private func pauseNext() {
    currentNext()?.pause()
  }

  private func startSessionObservers() {
    stopSessionObservers()
    routeObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      self?.handleRouteChange(notification)
    }
    interruptObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      self?.handleInterruption(notification)
    }
  }

  private func stopSessionObservers() {
    if let routeObserver {
      NotificationCenter.default.removeObserver(routeObserver)
      self.routeObserver = nil
    }
    if let interruptObserver {
      NotificationCenter.default.removeObserver(interruptObserver)
      self.interruptObserver = nil
    }
  }

  private func handleRouteChange(_ notification: Notification) {
    let reasonRaw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
    let reason = AVAudioSession.RouteChangeReason(rawValue: reasonRaw) ?? .unknown
    let previous = notification.userInfo?[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription
    let current = AVAudioSession.sharedInstance().currentRoute
    let previousPorts = Self.portTypes(of: previous)
    let currentPorts = Self.portTypes(of: current)
    if reason == .oldDeviceUnavailable || Self.lostWiredOutput(previous: previousPorts, current: currentPorts) {
      self.pauseNext()
    }
    sendEvent("onAudioRoute", [
      "reason": Self.routeReasonName(reason),
      "previousPorts": previousPorts,
      "currentPorts": currentPorts,
    ])
  }

  private func handleInterruption(_ notification: Notification) {
    let typeRaw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
    let type = AVAudioSession.InterruptionType(rawValue: typeRaw) ?? .began
    let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
    let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
    if type == .began {
      self.pauseNext()
    }
    sendEvent("onAudioInterruption", [
      "type": type == .ended ? "ended" : "began",
      "shouldResume": options.contains(.shouldResume),
      "currentPorts": Self.portTypes(of: AVAudioSession.sharedInstance().currentRoute),
    ])
  }

  private func tearDownNext() {
    DispatchQueue.main.async {
      self.fadeTimer?.invalidate()
      self.fadeTimer = nil
    }
    let player = currentNext()
    setNext(nil)
    player?.pause()
    player?.replaceCurrentItem(with: nil)
  }

  private static func waitUntilReady(item: AVPlayerItem, timeoutSec: Double) async -> Bool {
    if item.status == .readyToPlay { return true }
    if item.status == .failed { return false }

    return await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
      let state = ReadyWaitState()
      var observation: NSKeyValueObservation?
      observation = item.observe(\.status, options: [.new]) { observed, _ in
        if observed.status == .readyToPlay {
          observation?.invalidate()
          state.finish(true, cont)
        } else if observed.status == .failed {
          observation?.invalidate()
          state.finish(false, cont)
        }
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + timeoutSec) {
        observation?.invalidate()
        state.finish(item.status == .readyToPlay, cont)
      }
    }
  }

  private static func portTypes(of route: AVAudioSessionRouteDescription?) -> [String] {
    route?.outputs.map { $0.portType.rawValue } ?? []
  }

  private static func isWired(_ port: String) -> Bool {
    switch port.lowercased() {
    case "usb", "car", "headphones", "lineout": return true
    default: return false
    }
  }

  private static func lostWiredOutput(previous: [String], current: [String]) -> Bool {
    previous.contains { isWired($0) } && !current.contains { isWired($0) }
  }

  private static func routeReasonName(_ reason: AVAudioSession.RouteChangeReason) -> String {
    switch reason {
    case .unknown: return "unknown"
    case .newDeviceAvailable: return "newDeviceAvailable"
    case .oldDeviceUnavailable: return "oldDeviceUnavailable"
    case .categoryChange: return "categoryChange"
    case .override: return "override"
    case .wakeFromSleep: return "wakeFromSleep"
    case .noSuitableRouteForCategory: return "noSuitableRouteForCategory"
    case .routeConfigurationChange: return "routeConfigurationChange"
    @unknown default: return "unknown"
    }
  }
}

private final class ReadyWaitState: @unchecked Sendable {
  private let lock = NSLock()
  private var settled = false

  func finish(_ ok: Bool, _ cont: CheckedContinuation<Bool, Never>) {
    lock.lock()
    defer { lock.unlock() }
    guard !settled else { return }
    settled = true
    cont.resume(returning: ok)
  }
}
