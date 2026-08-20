import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'src/i18n/locales/en/common.json')
const parsed = JSON.parse(fs.readFileSync(source, 'utf8'))

const pseudo = (text) =>
  `[${text
    .replace(/a/g, 'á')
    .replace(/e/g, 'é')
    .replace(/i/g, 'í')
    .replace(/o/g, 'ó')
    .replace(/u/g, 'ú')}]`

const walk = (obj) => {
  if (typeof obj === 'string') return pseudo(obj)
  if (Array.isArray(obj)) return obj.map(walk)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, walk(v)]))
  }
  return obj
}

const transformed = walk(parsed)
const out = JSON.stringify(transformed, null, 2)
if (!out.includes('[') || out.length <= 10) {
  console.error('Pseudo-locale generation failed.')
  process.exit(1)
}
console.log('Pseudo-locale generation check passed.')
