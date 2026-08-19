#!/usr/bin/env node
/** Sign into Melofin web against the local demo Jellyfin and capture App Store 6.9" shots. */
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const HERE = import.meta.dirname
const ROOT = join(HERE, '../..')
const STORE_OUT = join(ROOT, 'store/screenshots')

// App Store Connect iPhone 6.9" is the only required size class for this
// iPhone-only portrait app (supportsTablet: false). Apple accepts 1–10 PNGs
// at 1320×2868, 1290×2796, or 1260×2736. Smaller iPhone classes scale from 6.9".
// iPad / Mac / Watch / TV / Vision / landscape are not required.
const VIEWPORT = { width: 440, height: 956 }
const DEVICE_SCALE = 3
const STORE_PX = { width: VIEWPORT.width * DEVICE_SCALE, height: VIEWPORT.height * DEVICE_SCALE }
const PNG_TRUECOLOR = 2
const PNG_INDEXED = 3
const STORE_MAX = 10
const WEB_PORT = Number(process.env.MELOFIN_WEB_PORT ?? 8081)
const WEB_URL = process.env.MELOFIN_WEB_URL ?? `http://127.0.0.1:${WEB_PORT}`
const JF_AUTH =
  'MediaBrowser Client="Melofin Screenshots", Device="screenshots", DeviceId="melofin-shots", Version="1.0.0"'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ping = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return r.ok || r.status === 404
  } catch {
    return false
  }
}

const credentials = async () => {
  const fallback = {
    serverUrl: process.env.MELOFIN_JF_URL ?? 'http://127.0.0.1:8096',
    username: process.env.MELOFIN_JF_USER ?? 'melofin',
    password: process.env.MELOFIN_JF_PASSWORD ?? 'melofin',
  }
  try {
    return { ...fallback, ...JSON.parse(await readFile(join(ROOT, '.demo-jellyfin/credentials.json'), 'utf8')) }
  } catch {
    return fallback
  }
}

const waitForUrl = async (url, ms) => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await ping(url)) return
    await sleep(400)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const ensureWeb = async () => {
  if (await ping(WEB_URL)) return null
  const child = spawn('npx', ['expo', 'start', '--web', '--port', String(WEB_PORT), '--non-interactive'], {
    cwd: ROOT,
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
    stdio: 'inherit',
  })
  await waitForUrl(WEB_URL, 180_000)
  return child
}

const loadDeps = async () => {
  if (!existsSync(join(HERE, 'node_modules/playwright')) || !existsSync(join(HERE, 'node_modules/sharp'))) {
    execSync('npm install', { cwd: HERE, stdio: 'inherit' })
  }
  const require = createRequire(join(HERE, 'package.json'))
  const pw = require('playwright')
  if (!existsSync(pw.chromium.executablePath())) {
    execSync('npx playwright install chromium', { cwd: HERE, stdio: 'inherit' })
  }
  return { playwright: pw, sharp: require('sharp') }
}

const jf = async (serverUrl, token, path, init = {}) => {
  const r = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: {
      'X-Emby-Authorization': JF_AUTH,
      ...(token ? { 'X-Emby-Token': token } : {}),
      ...init.headers,
    },
  })
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return r.json()
}

const seedDownloadsIndex = async (page, creds) => {
  const auth = await jf(creds.serverUrl, null, '/Users/AuthenticateByName', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: creds.username, Pw: creds.password }),
  })
  const token = auth.AccessToken
  const userId = auth.User?.Id
  const data = await jf(
    creds.serverUrl,
    token,
    `/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=Album,SortName&Fields=AlbumId,AlbumPrimaryImageTag&Limit=80`,
  )
  const now = Date.now()
  const entries = {}
  for (const track of data.Items ?? []) {
    const seconds = Number(track.RunTimeTicks ?? 0) / 10_000_000
    const albumId = track.AlbumId || track.ParentId
    const tag = track.AlbumPrimaryImageTag || track.ImageTags?.Primary
    entries[track.Id] = {
      itemId: track.Id,
      title: track.Name ?? 'Track',
      artist: track.AlbumArtist || track.Artists?.[0] || '',
      album: track.Album ?? 'Album',
      durationMs: Math.round(seconds * 1000),
      path: `audio/${track.Id}`,
      sizeBytes: Math.max(400_000, Math.round(seconds * 16_000)),
      artworkPath:
        albumId && tag
          ? `${creds.serverUrl}/Items/${albumId}/Images/Primary?maxWidth=960&maxHeight=960&quality=96&tag=${encodeURIComponent(tag)}&api_key=${encodeURIComponent(token)}`
          : undefined,
      downloadedAt: now,
      lastAccessedAt: now,
      kind: 'user',
      complete: true,
    }
  }
  if (!Object.keys(entries).length) {
    process.stderr.write('warning: no demo tracks to seed Downloads\n')
    return
  }
  await page.evaluate(
    (payload) => localStorage.setItem('melofin.fs.offline-index.json', JSON.stringify(payload)),
    { entries, budgetBytes: 8 * 1024 * 1024 * 1024, serverUrl: creds.serverUrl, userId },
  )
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })
}

const waitForArt = async (page) => {
  await page
    .waitForFunction(() => {
      const imgs = [...document.querySelectorAll('img')]
      if (imgs.length < 4) return false
      const ready = imgs.filter((img) => img.complete && img.naturalWidth > 8)
      return ready.length >= Math.min(14, Math.max(8, imgs.length - 2))
    }, { timeout: 20_000 })
    .catch(() => {})
  await sleep(700)
}

const waitForHome = async (page) => {
  for (const text of [/Good (morning|afternoon|evening)/i, 'Your Mixes', 'Recently Added']) {
    await page.getByText(text).waitFor({ timeout: 90_000 })
  }
  await page.getByRole('button', { name: /Mix\./ }).nth(5).waitFor({ timeout: 90_000 })
  await waitForArt(page)
}

const pngChunkLen = (buf, offset) => buf.readUInt32BE(offset)
const pngChunkType = (buf, offset) => buf.toString('ascii', offset + 4, offset + 8)

const pngHasTrns = (buf, offset = 8) => {
  if (offset + 12 > buf.length) return false
  const type = pngChunkType(buf, offset)
  if (type === 'tRNS') return true
  if (type === 'IEND') return false
  return pngHasTrns(buf, offset + 12 + pngChunkLen(buf, offset))
}

const pngInfo = (buf) => {
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('screenshot is not a PNG')
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],
    hasTrns: pngHasTrns(buf),
  }
}

const assertStorePng = (name, buf) => {
  const info = pngInfo(buf)
  if (info.width !== STORE_PX.width || info.height !== STORE_PX.height) {
    throw new Error(
      `${name}: got ${info.width}×${info.height}, expected ${STORE_PX.width}×${STORE_PX.height} (App Store 6.9")`,
    )
  }
  const opaque = (info.colorType === PNG_TRUECOLOR || info.colorType === PNG_INDEXED) && !info.hasTrns
  if (!opaque) {
    throw new Error(
      `${name}: PNG color type ${info.colorType} tRNS=${info.hasTrns} (App Store requires RGB, no alpha)`,
    )
  }
  return info
}

const kb = (bytes) => `${Math.round(bytes / 1024)}K`

const compressPng = async (sharp, buf) => {
  const packed = await sharp(buf, { failOn: 'none' })
    .removeAlpha()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality: 90,
      effort: 7,
      colours: 256,
    })
    .toBuffer()
  return packed.length < buf.length ? packed : buf
}

const createShot = (sharp) => {
  const taken = []
  const shot = async (page, name) => {
    if (taken.length >= STORE_MAX) {
      throw new Error(`App Store allows at most ${STORE_MAX} screenshots; extra shot "${name}"`)
    }
    const dest = join(STORE_OUT, `${String(taken.length + 1).padStart(2, '0')}-${name}.png`)
    const raw = await page.screenshot({
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
      scale: 'device',
    })
    assertStorePng(name, raw)
    const packed = await compressPng(sharp, raw)
    const info = assertStorePng(name, packed)
    await writeFile(dest, packed)
    taken.push(name)
    process.stdout.write(
      `wrote ${dest} (${info.width}×${info.height} RGB ${kb(raw.length)} → ${kb(packed.length)})\n`,
    )
  }
  return { shot, taken }
}

const waitForPlayHero = async (page) => {
  await page.getByRole('button', { name: 'Play' }).first().waitFor({ timeout: 20_000 })
  await waitForArt(page)
  await sleep(500)
}

const open = (page, path, timeout = 45_000) =>
  page.goto(path ? `${WEB_URL}${path}` : WEB_URL, { waitUntil: 'domcontentloaded', timeout })

const login = async (page, creds) => {
  await open(page, '', 90_000)
  const server = page.getByLabel('Server')
  try {
    await server.waitFor({ timeout: 8_000 })
  } catch {
    return
  }
  await server.fill(creds.serverUrl)
  await page.getByRole('button', { name: 'Continue' }).click()
  const user = page.getByLabel('Username')
  await user.waitFor({ timeout: 30_000 })
  await user.fill(creds.username)
  await page.getByLabel('Password').fill(creds.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

const main = async () => {
  await rm(STORE_OUT, { recursive: true, force: true })
  await mkdir(STORE_OUT, { recursive: true })
  const creds = await credentials()
  process.stdout.write(
    `capturing App Store 6.9" ${STORE_PX.width}×${STORE_PX.height} RGB PNG (max ${STORE_MAX})\n`,
  )
  await waitForUrl(`${creds.serverUrl}/System/Info/Public`, 10_000)
  const web = await ensureWeb()
  const { playwright, sharp } = await loadDeps()
  const { shot, taken } = createShot(sharp)
  const browser = await playwright.chromium.launch({ headless: true, args: ['--disable-web-security'] })
  const page = await (
    await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      colorScheme: 'dark',
      hasTouch: true,
      isMobile: true,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    })
  ).newPage()
  try {
    await login(page, creds)
    await waitForHome(page)
    await seedDownloadsIndex(page, creds)
    await waitForHome(page)
    await shot(page, 'home')

    await page.getByRole('button', { name: /Mix\./ }).first().click()
    await page.getByText(/tracks/i).waitFor({ timeout: 30_000 })
    await sleep(1_200)
    await waitForArt(page)
    await shot(page, 'mix')

    await open(page, '/search')
    const search = page.getByRole('textbox', { name: 'Search' })
    await search.waitFor({ timeout: 20_000 })
    await search.fill('The Run')
    const run = page.getByText('The Run', { exact: true }).first()
    await run.waitFor({ timeout: 25_000 })
    await run.click()
    await page.getByRole('button', { name: 'Play' }).first().waitFor({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Play' }).click()
    const mini = page.getByRole('button', { name: /^Now playing / }).first()
    await mini.waitFor({ timeout: 45_000 })
    await mini.click()
    await page.locator('[aria-label="Now Playing"]').waitFor({ timeout: 20_000 })
    await page
      .waitForFunction(() => {
        const root = document.querySelector('[aria-label="Now Playing"]')
        if (!root) return false
        return [...root.querySelectorAll('img')].some((img) => {
          const box = img.getBoundingClientRect()
          return img.complete && img.naturalWidth >= 900 && box.width > 200
        })
      }, { timeout: 20_000 })
      .catch(() => {})
    await sleep(800)
    await shot(page, 'now-playing')

    try {
      await page.getByLabel('Open queue').click({ timeout: 8_000 })
    } catch {
      await open(page, '/queue')
    }
    await page.getByText('Queue', { exact: true }).first().waitFor({ timeout: 20_000 })
    await sleep(600)
    await shot(page, 'queue')

    await open(page, '/library')
    await page.getByRole('tab', { name: 'albums' }).click()
    await page.getByText('Library').first().waitFor({ timeout: 20_000 })
    await waitForArt(page)
    await shot(page, 'library')

    await page.getByText('The Run', { exact: true }).first().click()
    await waitForPlayHero(page)
    await shot(page, 'album')

    await open(page, '/library')
    await page.getByRole('tab', { name: 'artists' }).click()
    await page.getByText('Library').first().waitFor({ timeout: 20_000 })
    await waitForArt(page)
    const artist = page.getByText('Adragante', { exact: true }).first()
    try {
      await artist.waitFor({ timeout: 8_000 })
      await artist.click()
    } catch {
      await page.getByRole('tab', { name: 'artists' }).click()
      await page.locator('img').nth(2).click()
    }
    await waitForPlayHero(page)
    await shot(page, 'artist')

    await open(page, '/library')
    await page.getByRole('tab', { name: 'playlists' }).click()
    await page.getByText('Library').first().waitFor({ timeout: 20_000 })
    const playlist = page.getByText('Late Night', { exact: true }).first()
    try {
      await playlist.waitFor({ timeout: 8_000 })
      await playlist.click()
    } catch {
      const focus = page.getByText('Focus', { exact: true }).first()
      await focus.waitFor({ timeout: 12_000 })
      await focus.click()
    }
    await waitForPlayHero(page)
    await shot(page, 'playlist')

    await open(page, '/search')
    await page.getByText('Search', { exact: true }).first().waitFor({ timeout: 20_000 })
    try {
      await page.getByText('Browse', { exact: true }).waitFor({ timeout: 25_000 })
    } catch {
      await page.getByLabel('Search').fill('jazz')
      await page.getByText('Songs', { exact: true }).first().waitFor({ timeout: 20_000 })
      await page.keyboard.press('Escape')
    }
    await waitForArt(page)
    await shot(page, 'search')

    await open(page, '/downloads')
    await page.getByText('Downloads', { exact: true }).first().waitFor({ timeout: 20_000 })
    await page.getByText('On This Device', { exact: true }).waitFor({ timeout: 20_000 })
    await page.getByRole('tab', { name: 'albums' }).waitFor({ timeout: 20_000 })
    await waitForArt(page)
    await shot(page, 'downloads')

    if (taken.length !== STORE_MAX) {
      throw new Error(`expected ${STORE_MAX} App Store screenshots, captured ${taken.length}`)
    }
  } finally {
    await browser.close()
    if (web) web.kill('SIGTERM')
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exit(1)
})
