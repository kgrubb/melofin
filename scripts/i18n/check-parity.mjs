import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const basePath = path.join(root, 'src/i18n/locales/en/common.json')
const localesDir = path.join(root, 'src/i18n/locales')
const targetPaths = fs
  .readdirSync(localesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'en')
  .map((entry) => path.join(localesDir, entry.name, 'common.json'))

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) return flatten(value, next)
    return [next]
  })

const collectStrings = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) return collectStrings(value, next)
    if (typeof value === 'string') return [[next, value]]
    return []
  })

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const baseKeys = new Set(flatten(readJson(basePath)))
const allLocaleFiles = [basePath, ...targetPaths]

const icuErrors = allLocaleFiles.flatMap((file) =>
  collectStrings(readJson(file))
    .filter(([, value]) => /\{\{\w+\}\}/.test(value))
    .map(([key]) => `${path.relative(root, file)}:${key} uses {{var}}; ICU expects {var}`),
)

const mismatches = targetPaths
  .map((file) => {
    const targetKeys = new Set(flatten(readJson(file)))
    return {
      file,
      missing: [...baseKeys].filter((key) => !targetKeys.has(key)),
      extra: [...targetKeys].filter((key) => !baseKeys.has(key)),
    }
  })
  .filter(({ missing, extra }) => missing.length > 0 || extra.length > 0)

for (const message of icuErrors) console.error(message)
for (const { file, missing, extra } of mismatches) {
  console.error(`\n${path.relative(root, file)} key mismatch:`)
  if (missing.length > 0) {
    console.error(`  Missing (${missing.length}):`)
    for (const key of missing) console.error(`    - ${key}`)
  }
  if (extra.length > 0) {
    console.error(`  Extra (${extra.length}):`)
    for (const key of extra) console.error(`    - ${key}`)
  }
}

if (icuErrors.length > 0 || mismatches.length > 0) process.exit(1)
console.log('Locale key parity check passed.')
