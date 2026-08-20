import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const includeFiles = new Set([
  'app/(app)/settings.tsx',
  'app/(app)/player.tsx',
  'app/(app)/queue.tsx',
  'app/(app)/(main)/(tabs)/downloads.tsx',
  'app/(app)/(main)/(tabs)/home.tsx',
  'app/(app)/(main)/(tabs)/library.tsx',
  'app/(app)/(main)/(tabs)/search.tsx',
  'app/(app)/(main)/(tabs)/_layout.tsx',
  'app/(app)/(main)/genre/[id].tsx',
  'app/_layout.tsx',
  'app/(auth)/server.tsx',
  'app/(auth)/login.tsx',
  'src/ui/NavChrome.tsx',
  'src/ui/PlaylistActions.tsx',
  'src/ui/primitives.tsx',
  'src/ui/CollectionScreen.tsx',
  'src/ui/DevicesSheet.tsx',
  'src/ui/EqBandSliders.tsx',
  'src/ui/ProgressBar.tsx',
  'src/ui/TrackRow.tsx',
  'src/ui/LyricsPanel.tsx',
  'src/ui/AlphabetIndex.tsx',
  'src/ui/AuthForm.tsx',
  'src/ui/AppErrorBoundary.tsx',
  'src/ui/MiniPlayer.tsx',
  'src/ui/FloatingTabBar.tsx',
  'app/+not-found.tsx',
])
const roots = ['app', 'src/ui'].map((segment) => path.join(root, segment))
const skipPatterns = [
  /\/\/\s*i18n-ignore/,
  /import\s+.*from\s+['"][^'"]+['"]/,
  /^\s*['"`][^'"`]*['"`][,;]?\s*$/,
]

const jsLike = /\.(ts|tsx|js|jsx)$/
const suspicious = /(['"`])([A-Za-z][^'"`\n]{2,})\1/g

const walk = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (jsLike.test(entry.name)) files.push(full)
  }
  return files
}

let failed = false
for (const dir of roots) {
  for (const file of walk(dir)) {
    const rel = path.relative(root, file)
    if (!includeFiles.has(rel)) continue
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (
        line.includes('t(') ||
        line.includes('i18n.t(') ||
        line.includes('accessibilityRole=') ||
        skipPatterns.some((pattern) => pattern.test(line))
      ) {
        continue
      }
      if (!line.includes('accessibilityLabel=') && !line.includes('title=') && !line.includes('placeholder=')) {
        continue
      }
      if (!suspicious.test(line)) continue
      failed = true
      console.error(`${rel}:${i + 1} possible hardcoded UI string`)
    }
  }
}

if (failed) process.exit(1)
console.log('Hardcoded UI string guard check passed.')
