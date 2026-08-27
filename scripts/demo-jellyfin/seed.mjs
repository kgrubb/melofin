#!/usr/bin/env node
/** Seed CC BY albums, boot local Jellyfin, create user melofin/melofin at http://127.0.0.1:8096.
 *  Re-runs skip Archive.org when album folders already have mp3s. */
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readFileSync, statSync } from 'node:fs'

const HERE = import.meta.dirname
const DEMO = join(HERE, '../../.demo-jellyfin')
const MEDIA = join(DEMO, 'media')
const COMPOSE = join(HERE, 'docker-compose.yml')
const JF = process.env.MELOFIN_JF_URL ?? 'http://127.0.0.1:8096'
const AUTH =
  'MediaBrowser Client="Melofin Seed", Device="seed", DeviceId="melofin-demo", Version="1.0.0"'
const IA = 'https://archive.org'
const COVER_TARGET_EDGE = 1800
const COVER_SHARP_EDGE = 960

const log = (m) => process.stdout.write(`${m}\n`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const enc = encodeURIComponent
const safe = (v) =>
  v.replace(/[<>:"/\\|?*\u0000]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Unknown'
const have = (p) => {
  try {
    return statSync(p).size > 16_000
  } catch {
    return false
  }
}
const bin = (name) => spawnSync('which', [name], { encoding: 'utf8' }).stdout.trim()
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: opts.stdio ?? 'pipe' })
  if (r.status !== 0 && !opts.ok) throw new Error(`${cmd} ${args.join(' ')} failed`)
  return r
}
const albumPath = (album) => join(MEDIA, safe(album.artist), safe(album.album))
const artistPath = (album) => join(MEDIA, safe(album.artist))
const iaDl = (id, name) => `${IA}/download/${enc(id)}/${enc(name)}`
const iaImg = (id) => `${IA}/services/img/${enc(id)}`

const pool = async (items, n, fn) => {
  if (!items.length) return []
  const limit = Math.max(1, Math.min(n, items.length))
  const batches = Array.from({ length: Math.ceil(items.length / limit) }, (_, b) =>
    items.slice(b * limit, b * limit + limit).map((item, j) => fn(item, b * limit + j)),
  )
  return batches.reduce(
    async (prev, batch) => [...(await prev), ...(await Promise.all(batch))],
    Promise.resolve([]),
  )
}

const retry = async (fn, tries = 4, attempt = 0) => {
  try {
    return await fn()
  } catch (e) {
    if (attempt + 1 >= tries) throw e
    await sleep(300 * 2 ** attempt)
    return retry(fn, tries, attempt + 1)
  }
}

const getJson = (url) =>
  retry(async () => {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(`${r.status} ${url}`)
    const t = await r.text()
    return t ? JSON.parse(t) : null
  })

const download = async (url, dest, tries = 3) => {
  if (have(dest)) return
  await mkdir(dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  await retry(async () => {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(120_000),
      headers: { 'User-Agent': 'MelofinDemo/1.0 (cover seed)' },
    })
    if (!r.ok || !r.body) throw new Error(`download ${r.status} ${url}`)
    await writeFile(tmp, Buffer.from(await r.arrayBuffer()))
    await rename(tmp, dest)
  }, tries).catch(async (e) => {
    await rm(tmp, { force: true })
    throw e
  })
}

const jf = async (path, token, init = {}) => {
  const r = await fetch(`${JF}${path}`, {
    ...init,
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: AUTH,
      'X-Emby-Authorization': AUTH,
      ...(token ? { 'X-Emby-Token': token } : {}),
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!r.ok && r.status !== 204) throw new Error(`${r.status} ${path} ${(await r.text()).slice(0, 200)}`)
  if (r.status === 204) return null
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

const post = (path, token, body) =>
  jf(path, token, { method: 'POST', body: JSON.stringify(body) })

const until = async (fn, ms = 300, n = 200, attempt = 0) => {
  try {
    const v = await fn()
    if (v) return v
  } catch {
    // retry
  }
  if (attempt + 1 >= n) throw new Error('timeout')
  await sleep(ms)
  return until(fn, ms, n, attempt + 1)
}

const mp3s = (files, max) =>
  files
    .map((f) => f.name)
    .filter(
      (n) =>
        n.toLowerCase().endsWith('.mp3') &&
        !/spectrogram|sample|preview|__ia/i.test(n) &&
        !/\b(fuck(?:er|ing)?|shit|bitch|asshole|cunt|wank|blowjob)\b/i.test(n),
    )
    .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, max)

const coverOf = (files) => {
  const imgs = files
    .filter((f) => /\.(jpe?g|png)$/i.test(f.name) && !/spectrogram|_thumb|^__/i.test(f.name))
    .toSorted((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))
  return (
    imgs.find((f) => Number(f.size ?? 0) >= 20_000)?.name ??
    ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'poster.jpg'].find((n) =>
      imgs.some((f) => f.name === n),
    ) ??
    imgs[0]?.name
  )
}

const jpegMinEdge = (buf, i = 2) => {
  if (i >= buf.length - 8) return 0
  if (buf[i] !== 0xff) return jpegMinEdge(buf, i + 1)
  const m = buf[i + 1]
  if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
    return Math.min(buf.readUInt16BE(i + 5), buf.readUInt16BE(i + 7))
  }
  if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) return jpegMinEdge(buf, i + 2)
  return jpegMinEdge(buf, i + 2 + buf.readUInt16BE(i + 2))
}

const imageMinEdge = (path) => {
  try {
    const buf = readFileSync(path)
    if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') {
      return Math.min(buf.readUInt32BE(16), buf.readUInt32BE(20))
    }
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return 0
    return jpegMinEdge(buf)
  } catch {
    // missing or not an image
  }
  return 0
}

const coverOk = (path) => imageMinEdge(path) >= 400

const copyPoster = async (src, artistDir) => {
  await copyFile(src, join(artistDir, 'folder.jpg'))
  await copyFile(src, join(artistDir, 'poster.jpg'))
}

const upsampleCover = (path) => {
  if (imageMinEdge(path) >= COVER_SHARP_EDGE) return false
  const py = bin('python3')
  if (!py) return false
  const r = spawnSync(
    py,
    [
      '-c',
      [
        'from PIL import Image',
        'from pathlib import Path',
        `p = Path(${JSON.stringify(path)})`,
        'im = Image.open(p).convert("RGB")',
        'w, h = im.size',
        'edge = min(w, h)',
        `if edge >= ${COVER_SHARP_EDGE}: raise SystemExit(0)`,
        `scale = ${COVER_TARGET_EDGE} / edge`,
        'im = im.resize((round(w * scale), round(h * scale)), Image.Resampling.LANCZOS)',
        'im.save(p, "JPEG", quality=92, optimize=True, subsampling=0)',
      ].join('\n'),
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    log(`upsample failed ${path}: ${(r.stderr || r.stdout || '').trim()}`)
    return false
  }
  return imageMinEdge(path) >= COVER_SHARP_EDGE
}

const titleOf = (name) => {
  const base = name.replace(/\.[^.]+$/, '')
  const jamendo = base.match(/^\d+-+\d+-.+?-(.+)$/)
  if (jamendo?.[1]) return jamendo[1].replace(/_/g, ' ').trim()
  return (base.split('_-_').at(-1) ?? base).replace(/_/g, ' ').replace(/^\d+\s*-\s*/, '').trim()
}

const id3frame = (id, text) => {
  const payload = Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(`${text}\0`, 'utf16le')])
  const head = Buffer.alloc(10)
  head.write(id)
  head.writeUInt32BE(payload.length, 4)
  return Buffer.concat([head, payload])
}

const id3 = (meta) => {
  const body = Buffer.concat(
    ['TIT2', 'TPE1', 'TPE2', 'TALB', 'TCON', 'TRCK'].map((id, i) =>
      id3frame(id, [meta.title, meta.artist, meta.artist, meta.album, meta.genre, meta.track][i]),
    ),
  )
  const size = Buffer.from([
    (body.length >> 21) & 0x7f,
    (body.length >> 14) & 0x7f,
    (body.length >> 7) & 0x7f,
    body.length & 0x7f,
  ])
  return Buffer.concat([Buffer.from('ID3\x03\x00\x00'), size, body])
}

const tagMp3 = async (src, dest, meta) => {
  const audio = await readFile(src)
  const tagged = audio.subarray(0, 3).equals(Buffer.from('ID3'))
    ? Buffer.concat([
        id3(meta),
        audio.subarray(10 + ((audio[6] << 21) | (audio[7] << 14) | (audio[8] << 7) | audio[9])),
      ])
    : Buffer.concat([id3(meta), audio])
  await writeFile(dest, tagged)
}

const listMp3 = async (dir) => {
  try {
    return (await readdir(dir)).filter((n) => n.endsWith('.mp3'))
  } catch {
    return []
  }
}

const seedMedia = async (catalog) => {
  await mkdir(MEDIA, { recursive: true })
  const need = (
    await Promise.all(
      catalog.albums.map(async (album) =>
        (await listMp3(albumPath(album))).length ? null : album,
      ),
    )
  ).filter(Boolean)
  if (!need.length) {
    log(`media ready (${catalog.albums.length} albums on disk)`)
  } else {
    log(`fetching ${need.length} albums`)
    const packed = await pool(need, 10, async (album) => {
      const data = await getJson(`${IA}/metadata/${album.identifier}`)
      const tracks = mp3s(data.files ?? [], album.maxTracks)
      if (!tracks.length) {
        log(`no mp3s in ${album.identifier}`)
        return null
      }
      log(`catalog ${album.artist} — ${album.album}`)
      return { album, tracks, coverName: coverOf(data.files ?? []) }
    })

    const rows = packed.filter(Boolean)
    await Promise.all(rows.map(({ album }) => mkdir(albumPath(album), { recursive: true })))
    const covers = rows.map(({ album, coverName }) => ({
      url: coverName ? iaDl(album.identifier, coverName) : iaImg(album.identifier),
      dest: join(albumPath(album), 'folder.jpg'),
      artistDir: artistPath(album),
      ident: album.identifier,
    }))
    const jobs = rows.flatMap(({ album, tracks }) => {
      const albumDir = albumPath(album)
      return tracks.map((name, i) => ({
        album,
        name,
        i,
        albumDir,
        url: iaDl(album.identifier, name),
      }))
    })

    await pool(covers, 10, async ({ url, dest, artistDir, ident }) => {
      try {
        await download(url, dest)
      } catch {
        try {
          await download(iaImg(ident), dest, 2)
        } catch (e) {
          log(`cover skipped ${ident}: ${e.message}`)
        }
      }
      if (!coverOk(join(artistDir, 'folder.jpg')) && (coverOk(dest) || have(dest))) {
        await copyPoster(dest, artistDir)
      }
    })

    log(`downloading ${jobs.length} tracks`)
    await pool(jobs, 10, async (job) => {
      const dest = join(
        job.albumDir,
        `${String(job.i + 1).padStart(2, '0')} ${safe(titleOf(job.name))}.mp3`,
      )
      if (have(dest)) return
      const raw = join(job.albumDir, `raw-${job.i}.mp3`)
      try {
        await download(job.url, raw)
        await tagMp3(raw, dest, {
          title: titleOf(job.name),
          artist: job.album.artist,
          album: job.album.album,
          genre: job.album.genre,
          track: `${job.i + 1}/${job.album.maxTracks}`,
        })
      } catch (e) {
        log(`track skipped ${job.album.album}: ${e.message}`)
      }
      await rm(raw, { force: true })
    })
  }
  await ensureCovers(catalog)
}

const ensureCovers = async (catalog) => {
  const weak = catalog.albums.filter((album) => !coverOk(join(albumPath(album), 'folder.jpg')))
  if (weak.length) {
    log(`upgrading ${weak.length} covers`)
    await pool(weak, 6, async (album) => {
      const dest = join(albumPath(album), 'folder.jpg')
      await mkdir(albumPath(album), { recursive: true })
      const tries = []
      const jid = album.identifier.match(/^jamendo-(\d+)$/)?.[1]
      if (jid) tries.push(`https://usercontent.jamendo.com?type=album&id=${jid}&width=600`)
      try {
        const data = await getJson(`${IA}/metadata/${album.identifier}`)
        const coverName = coverOf(data.files ?? [])
        const names = new Set(coverName ? [coverName, 'cover.jpg'] : ['cover.jpg'])
        for (const name of names) tries.push(iaDl(album.identifier, name))
      } catch {
        // metadata unavailable
      }
      tries.push(iaImg(album.identifier))
      const tmp = `${dest}.upgrade`
      const currentEdge = imageMinEdge(dest)
      for (const url of tries) {
        try {
          await rm(tmp, { force: true })
          await download(url, tmp, 2)
          const edge = imageMinEdge(tmp)
          if (edge > currentEdge && (coverOk(tmp) || currentEdge === 0)) {
            await rename(tmp, dest)
            if (coverOk(dest)) break
          }
        } catch (e) {
          log(`cover try failed ${album.identifier}: ${e.message}`)
        }
        await rm(tmp, { force: true })
      }
      if (!have(dest) && imageMinEdge(dest) === 0) log(`cover skipped ${album.identifier}`)
    })
  }
  let upsampled = 0
  for (const album of catalog.albums) {
    const dest = join(albumPath(album), 'folder.jpg')
    if (upsampleCover(dest)) upsampled += 1
    const poster = join(artistPath(album), 'folder.jpg')
    if (!coverOk(dest) && imageMinEdge(dest) === 0) continue
    if (imageMinEdge(dest) > imageMinEdge(poster)) await copyPoster(dest, artistPath(album))
  }
  if (upsampled) log(`upsampled ${upsampled} covers to ${COVER_TARGET_EDGE}px`)
}

const pruneEmptyMetadataImages = async () => {
  const root = join(DEMO, 'config/metadata/library')
  let files = []
  try {
    files = await readdir(root, { recursive: true })
  } catch {
    return
  }
  for (const rel of files) {
    const path = join(root, rel)
    try {
      if (statSync(path).isFile() && statSync(path).size === 0) await rm(path, { force: true })
    } catch {
      // gone
    }
  }
}

const refreshImages = async (token, userId) => {
  await pruneEmptyMetadataImages()
  const items = (
    await jf(
      `/Users/${userId}/Items?IncludeItemTypes=MusicAlbum,MusicArtist&Recursive=true&Fields=ImageTags&Limit=400`,
      token,
    )
  )?.Items ?? []
  if (!items.length) return
  log(`refreshing art for ${items.length} items`)
  await pool(items, 4, (item) =>
    jf(
      `/Items/${item.Id}/Refresh?MetadataRefreshMode=None&ImageRefreshMode=FullRefresh&ReplaceAllImages=false&Recursive=true`,
      token,
      { method: 'POST' },
    ),
  )
  await sleep(2500)
  await pruneEmptyMetadataImages()
}

const docker = () => {
  const d = bin('docker') || 'docker'
  if (sh(d, ['info'], { ok: true }).status === 0) return d
  const colima = bin('colima')
  if (!colima) throw new Error('Docker is not running. Start Colima or Docker Desktop.')
  log('starting Colima')
  sh(colima, ['start', '--cpu', '2', '--memory', '3', '--disk', '20'], { stdio: 'inherit' })
  if (sh(d, ['info'], { ok: true }).status !== 0) {
    throw new Error('Colima started but Docker is still unavailable')
  }
  return d
}

const composeUp = () => sh(docker(), ['compose', '-f', COMPOSE, 'up', '-d'], { stdio: 'inherit' })

const login = (catalog) =>
  post('/Users/AuthenticateByName', undefined, { Username: catalog.user, Pw: catalog.password })

const items = (token, userId, type) =>
  jf(
    `/Users/${userId}/Items?IncludeItemTypes=${type}&Recursive=true&Fields=Genres,PrimaryImageAspectRatio&Limit=400`,
    token,
  ).then((d) => d?.Items ?? [])

const decorate = async (token, userId) => {
  const [artists, albums, tracks, playlists] = await Promise.all([
    items(token, userId, 'MusicArtist'),
    items(token, userId, 'MusicAlbum'),
    items(token, userId, 'Audio'),
    items(token, userId, 'Playlist'),
  ])
  if (!artists.length || !tracks.length) throw new Error('Jellyfin library is empty after scan')
  const fav = (id) => jf(`/Users/${userId}/FavoriteItems/${id}`, token, { method: 'POST' })
  await Promise.all([
    ...artists.slice(0, 8).map((a) => fav(a.Id)),
    ...tracks.slice(0, 16).map((t) => fav(t.Id)),
    ...tracks
      .filter((_, i) => i % 7 === 0)
      .slice(0, 4)
      .map((t) =>
        post(`/Users/${userId}/Items/${t.Id}/UserData`, token, {
          PlaybackPositionTicks: Math.floor(Number(t.RunTimeTicks ?? 90_000_0000) * 0.22),
          Played: false,
          IsFavorite: false,
          LastPlayedDate: new Date().toISOString(),
        }),
      ),
  ])
  if (!playlists.length) {
    const make = (name, ids) =>
      ids.length >= 8 &&
      post('/Playlists', token, { Name: name, Ids: ids, UserId: userId, MediaType: 'Audio' })
    await Promise.all([
      make('Late Night', tracks.slice(8, 20).map((t) => t.Id)),
      make('Focus', tracks.slice(20, 32).map((t) => t.Id)),
    ])
  }
  log(`ready ${artists.length} artists, ${albums.length} albums, ${tracks.length} tracks`)
}

const main = async () => {
  const catalog = JSON.parse(await readFile(join(HERE, 'catalog.json'), 'utf8'))
  await mkdir(join(DEMO, 'config'), { recursive: true })
  await mkdir(join(DEMO, 'cache'), { recursive: true })
  if (process.argv.includes('--covers-only')) {
    await ensureCovers(catalog)
    composeUp()
    const session = await login(catalog)
    await refreshImages(session.AccessToken, session.User?.Id)
    return
  }
  await seedMedia(catalog)
  composeUp()
  const info = await until(() => getJson(`${JF}/System/Info/Public`))
  if (!info.StartupWizardCompleted) {
    log('completing first-run wizard')
    await until(async () => {
      await post('/Startup/Configuration', undefined, {
        ServerName: catalog.serverName,
        UICulture: 'en-US',
        MetadataCountryCode: 'US',
        PreferredMetadataLanguage: 'en',
      })
      return true
    }, 500, 60)
    await jf('/Startup/User', undefined, { method: 'GET' })
    await post('/Startup/User', undefined, { Name: catalog.user, Password: catalog.password })
    await post('/Startup/RemoteAccess', undefined, {
      EnableRemoteAccess: true,
      EnableAutomaticPortMapping: false,
    })
    await jf('/Startup/Complete', undefined, { method: 'POST' })
  }
  const session = await login(catalog)
  const token = session.AccessToken
  const userId = session.User?.Id
  const folders = await jf('/Library/VirtualFolders', token)
  const hasMusic = (folders ?? []).some(
    (f) => String(f.CollectionType ?? '').toLowerCase() === 'music' || f.Name === 'Music',
  )
  if (!hasMusic) {
    await post(`/Library/VirtualFolders?name=Music&collectionType=music&refreshLibrary=true`, token, {
      LibraryOptions: {
        Enabled: true,
        EnablePhotos: true,
        EnableRealtimeMonitor: true,
        SaveLocalMetadata: false,
        EnableInternetProviders: false,
        PathInfos: [{ Path: '/media' }],
        PreferredMetadataLanguage: 'en',
        MetadataCountryCode: 'US',
        TypeOptions: [
          { Type: 'MusicAlbum', MetadataFetchers: [], ImageFetchers: ['Embedded Image Extractor', 'Local Image Provider'] },
          { Type: 'Audio', MetadataFetchers: [], ImageFetchers: ['Embedded Image Extractor', 'Local Image Provider'] },
          { Type: 'MusicArtist', MetadataFetchers: [], ImageFetchers: ['Local Image Provider'] },
        ],
      },
    })
  }
  log('waiting for library scan')
  const want = catalog.albums.length
  await until(async () => {
    const [audio, albums] = await Promise.all([
      jf(`/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true&Limit=1`, token),
      jf(`/Users/${userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&Limit=1`, token),
    ])
    const tracks = Number(audio?.TotalRecordCount ?? 0)
    const albumCount = Number(albums?.TotalRecordCount ?? 0)
    if (albumCount >= want && tracks >= 40) {
      log(`scanned ${albumCount} albums, ${tracks} tracks`)
      return tracks
    }
  })
  await refreshImages(token, userId)
  await decorate(token, userId)
  await writeFile(
    join(DEMO, 'credentials.json'),
    `${JSON.stringify({ serverUrl: JF, username: catalog.user, password: catalog.password })}\n`,
  )
  log(`Jellyfin demo is up at ${JF} (${catalog.user} / ${catalog.password})`)
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e.message}\n`)
  if (e.cause) process.stderr.write(`${e.cause}\n`)
  process.exit(1)
})
