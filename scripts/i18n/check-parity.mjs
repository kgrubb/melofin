import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const basePath = path.join(root, 'src/i18n/locales/en/common.json')
const localesDir = path.join(root, 'src/i18n/locales')
const targetPaths = fs
  .readdirSync(localesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'en')
  .map((entry) => path.join(localesDir, entry.name, 'common.json'))

const flatten = (obj, prefix = '', out = new Set()) => {
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, next, out)
    else out.add(next)
  }
  return out
}

const collectStrings = (obj, prefix = '', out = []) => {
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) collectStrings(value, next, out)
    else if (typeof value === 'string') out.push([next, value])
  }
  return out
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const baseKeys = flatten(readJson(basePath))
const allLocaleFiles = [
  basePath,
  ...targetPaths,
]
let failed = false

for (const file of allLocaleFiles) {
  for (const [key, value] of collectStrings(readJson(file))) {
    if (/\{\{\w+\}\}/.test(value)) {
      failed = true
      console.error(`${path.relative(root, file)}:${key} uses {{var}}; ICU expects {var}`)
    }
  }
}

for (const file of targetPaths) {
  const targetKeys = flatten(readJson(file))
  const missing = [...baseKeys].filter((key) => !targetKeys.has(key))
  const extra = [...targetKeys].filter((key) => !baseKeys.has(key))
  if (missing.length === 0 && extra.length === 0) continue
  failed = true
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

if (failed) process.exit(1)
console.log('Locale key parity check passed.')
