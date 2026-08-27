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
const suspicious = /(['"`])([A-Za-z][^'"`\n]{2,})\1/

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return []
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (jsLike.test(entry.name)) return [full]
    return []
  })

const issues = roots.flatMap((dir) =>
  walk(dir).flatMap((file) => {
    const rel = path.relative(root, file)
    if (!includeFiles.has(rel)) return []
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => {
        if (
          line.includes('t(') ||
          line.includes('i18n.t(') ||
          line.includes('accessibilityRole=') ||
          skipPatterns.some((pattern) => pattern.test(line))
        ) {
          return []
        }
        if (
          !line.includes('accessibilityLabel=') &&
          !line.includes('title=') &&
          !line.includes('placeholder=')
        ) {
          return []
        }
        if (!suspicious.test(line)) return []
        return [`${rel}:${i + 1} possible hardcoded UI string`]
      })
  }),
)

for (const message of issues) console.error(message)
if (issues.length > 0) process.exit(1)
console.log('Hardcoded UI string guard check passed.')
