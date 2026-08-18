#!/usr/bin/env node
/** Sign into Melio web against the local demo Jellyfin and capture README shots. */
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const HERE = import.meta.dirname
const ROOT = join(HERE, '../..')
const OUT = join(ROOT, 'assets/screenshots')
const WEB_PORT = Number(process.env.MELIO_WEB_PORT ?? 8081)
const WEB_URL = process.env.MELIO_WEB_URL ?? `http://127.0.0.1:${WEB_PORT}`
const JF_AUTH =
  'MediaBrowser Client="Melio Screenshots", Device="screenshots", DeviceId="melio-shots", Version="1.0.0"'

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
    serverUrl: process.env.MELIO_JF_URL ?? 'http://127.0.0.1:8096',
    username: process.env.MELIO_JF_USER ?? 'melio',
    password: process.env.MELIO_JF_PASSWORD ?? 'melio',
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

const loadPlaywright = async () => {
  if (!existsSync(join(HERE, 'node_modules/playwright'))) execSync('npm install', { cwd: HERE, stdio: 'inherit' })
  const pw = createRequire(join(HERE, 'package.json'))('playwright')
  if (!existsSync(pw.chromium.executablePath())) {
    execSync('npx playwright install chromium', { cwd: HERE, stdio: 'inherit' })
  }
  return pw
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
    (payload) => localStorage.setItem('melio.fs.offline-index.json', JSON.stringify(payload)),
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

const shot = async (page, name) => {
  const dest = join(OUT, `${name}.png`)
  await page.screenshot({ path: dest, type: 'png' })
  process.stdout.write(`wrote ${dest}\n`)
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
  await mkdir(OUT, { recursive: true })
  const creds = await credentials()
  await waitForUrl(`${creds.serverUrl}/System/Info/Public`, 10_000)
  const web = await ensureWeb()
  const playwright = await loadPlaywright()
  const browser = await playwright.chromium.launch({ headless: true, args: ['--disable-web-security'] })
  const page = await (
    await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      colorScheme: 'dark',
      hasTouch: true,
      isMobile: true,
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

    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 45_000 })
    await waitForHome(page)

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

    await open(page, '/library')
    await page.getByRole('tab', { name: 'albums' }).click()
    await page.getByText('Library').first().waitFor({ timeout: 20_000 })
    await waitForArt(page)
    await shot(page, 'library')

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
  } finally {
    await browser.close()
    if (web) web.kill('SIGTERM')
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exit(1)
})
