const { createRunOncePlugin, withDangerousMod } = require('expo/config-plugins')
const fs = require('node:fs')
const path = require('node:path')

/**
 * google-cast-sdk 4.8.4+ references UIGlassEffect (iOS 26). Xcode 16.4 cannot
 * link that symbol — pin 4.8.3 until we build with a newer Xcode.
 */
const PIN = "  pod 'google-cast-sdk', '4.8.3'\n"

const withPinnedGoogleCast = (config) =>
  withDangerousMod(config, [
    'ios',
    async (mod) => {
      const podfile = path.join(mod.modRequest.platformProjectRoot, 'Podfile')
      if (!fs.existsSync(podfile)) return mod
      const src = fs.readFileSync(podfile, 'utf8')
      if (src.includes("pod 'google-cast-sdk'")) return mod
      const needle = 'target '
      const idx = src.indexOf(needle)
      if (idx < 0) return mod
      // Insert after the first `target 'Melio' do` line.
      const lines = src.split('\n')
      const targetIdx = lines.findIndex((line) =>
        /^\s*target ['"]Melio['"]\s+do\s*$/.test(line),
      )
      if (targetIdx < 0) return mod
      const next = [
        ...lines.slice(0, targetIdx + 1),
        PIN.trimEnd(),
        ...lines.slice(targetIdx + 1),
      ]
      fs.writeFileSync(podfile, next.join('\n'))
      return mod
    },
  ])

module.exports = createRunOncePlugin(
  withPinnedGoogleCast,
  'with-pinned-google-cast',
  '1.0.0',
)
