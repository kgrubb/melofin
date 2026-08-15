import AVFoundation
import ExpoModulesCore

/**
 Melio audio graph companion.

 Owns next-item priming and optional overlap crossfade via a secondary
 AVPlayer while expo-audio fades the primary track.

 EQ / true gapless require inserting into the expo-audio render path and are
 intentionally not claimed here until that lands.
 */
public final class MelioAudioGraphModule: Module {
  private var nextItem: AVPlayerItem?
  private var crossfadePlayer: AVPlayer?
  private var fadeTimer: Timer?

  public func definition() -> ModuleDefinition {
    Name("MelioAudioGraph")

    Function("isAvailable") { () -> Bool in
      true
    }

    AsyncFunction("setNextUri") { (uri: String, headers: [String: String]?) -> Bool in
      guard let url = URL(string: uri) else { return false }
      // Headers are accepted for API compatibility; Jellyfin auth is usually
      // in the query string, and AVPlayerItem(url:) does not take a URLRequest.
      _ = headers
      let item = AVPlayerItem(url: url)
      // Touch asset to start buffering for crossfade handoff.
      _ = item.asset.duration
      self.nextItem = item
      return true
    }

    Function("clearNext") {
      self.stopCrossfadePlayer()
      self.nextItem = nil
    }

    /// Start primed next item at volume 0 and ramp to 1 over `durationSec`.
    /// Returns immediately once overlap has started so the JS primary fade can run in parallel.
    AsyncFunction("crossfadeToNext") { (durationSec: Double) -> Bool in
      guard let item = self.nextItem else { return false }
      self.stopCrossfadePlayer()
      let player = AVPlayer(playerItem: item)
      player.volume = 0
      self.crossfadePlayer = player
      player.play()

      let duration = max(0.05, durationSec)
      let steps = max(8, Int(duration * 20))
      let stepDuration = duration / Double(steps)

      DispatchQueue.main.async {
        self.fadeTimer?.invalidate()
        var step = 0
        self.fadeTimer = Timer.scheduledTimer(withTimeInterval: stepDuration, repeats: true) { timer in
          step += 1
          let t = min(1.0, Double(step) / Double(steps))
          player.volume = Float(t)
          if step >= steps {
            timer.invalidate()
            self.fadeTimer = nil
          }
        }
      }
      return true
    }

    Function("stopCrossfade") {
      self.stopCrossfadePlayer()
    }

    // No-ops until EQ is inserted on the real playback graph.
    Function("setEqGains") { (_ gainsDb: [Double]) in
    }

    Function("resetEq") {
    }
  }

  private func stopCrossfadePlayer() {
    fadeTimer?.invalidate()
    fadeTimer = nil
    crossfadePlayer?.pause()
    crossfadePlayer = nil
  }
}
