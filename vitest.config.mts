import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**/*.ts',
        'src/logging/**/*.ts',
        'src/player/trackResolver.ts',
        'src/player/playbackEnd.ts',
        'src/carplay/templates.ts',
        'src/services/jellyfin/sso.ts',
        'src/services/jellyfin/mappers.ts',
        'src/services/jellyfin/libraryPaging.ts',
        'src/theme/tokens.ts',
        'src/theme/motionMath.ts',
      ],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
      reporter: ['text', 'html', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': root,
    },
  },
})
