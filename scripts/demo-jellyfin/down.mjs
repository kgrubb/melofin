#!/usr/bin/env node
/** Stop the demo Jellyfin container and delete `.demo-jellyfin/`. */
import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const dir = import.meta.dirname
spawnSync('docker', ['compose', '-f', join(dir, 'docker-compose.yml'), 'down', '--remove-orphans'], {
  stdio: 'inherit',
})
spawnSync('docker', ['rm', '-f', 'melio-demo-jellyfin'], { stdio: 'ignore' })
await rm(join(dir, '../../.demo-jellyfin'), { recursive: true, force: true })
