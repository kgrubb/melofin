import AVFoundation
import ExpoModulesCore

/// Secondary AVPlayer for gapless / crossfade handoff.
public final class MelioAudioGraphModule: Module {
  private var nextPlayer: AVPlayer?
  private var fadeTimer: Timer?
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("MelioAudioGraph")

    Function("isAvailable") { () -> Bool in true }

    AsyncFunction("setNextUri") { (uri: String, headers: [String: String]?) -> Bool in
      guard let url = URL(string: uri) else { return false }
      _ = headers // auth is typically in the query string
      self.tearDownNext()

      let item = AVPlayerItem(url: url)
      let player = AVPlayer(playerItem: item)
      player.volume = 0
      player.automaticallyWaitsToMinimizeStalling = true
      _ = await Self.waitUntilReady(item: item, timeoutSec: 8)

      self.lock.lock()
      self.nextPlayer = player
      self.lock.unlock()
      return true
    }

    Function("clearNext") { self.tearDownNext() }

    AsyncFunction("playNextImmediate") { (volume: Double) -> Bool in
      self.lock.lock()
      let player = self.nextPlayer
      self.lock.unlock()
      guard let player else { return false }
      await MainActor.run {
        self.fadeTimer?.invalidate()
        self.fadeTimer = nil
        player.volume = Float(max(0, min(1, volume)))
        player.play()
      }
      return true
    }

    AsyncFunction("crossfadeToNext") { (durationSec: Double) -> Bool in
      self.lock.lock()
      let player = self.nextPlayer
      self.lock.unlock()
      guard let player else { return false }

      let duration = max(0.05, durationSec)
      let steps = max(8, Int(duration * 20))
      let stepDuration = duration / Double(steps)

      await MainActor.run {
        self.fadeTimer?.invalidate()
        self.fadeTimer = nil
        player.volume = 0
        player.play()
        var step = 0
        self.fadeTimer = Timer.scheduledTimer(withTimeInterval: stepDuration, repeats: true) { [weak self] timer in
          guard let self else {
            timer.invalidate()
            return
          }
          step += 1
          player.volume = Float(min(1, Double(step) / Double(steps)))
          if step >= steps {
            timer.invalidate()
            self.fadeTimer = nil
          }
        }
      }
      return true
    }

    Function("handoffPositionSec") { () -> Double in
      self.lock.lock()
      let player = self.nextPlayer
      self.lock.unlock()
      guard let player else { return 0 }
      let seconds = player.currentTime().seconds
      return seconds.isFinite ? seconds : 0
    }

    Function("setEqGains") { (_ gainsDb: [Double]) in }
    Function("resetEq") { }
  }

  private func tearDownNext() {
    DispatchQueue.main.async {
      self.fadeTimer?.invalidate()
      self.fadeTimer = nil
    }
    self.lock.lock()
    let player = self.nextPlayer
    self.nextPlayer = nil
    self.lock.unlock()
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
