const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'coverage/**',
      'android/**',
      'ios/**',
      'plugins/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'import/namespace': 'off',
      'import/default': 'off',
      'import/no-unresolved': 'off',
      'import/no-duplicates': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message: 'No for...in (use Object.keys / entries).',
        },
      ],
    },
  },
  {
    files: ['app/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/src/services/**',
                '@/src/store/**',
                '@/src/ui/**',
                '@/src/player/**',
                '@/src/offline/**',
                '@/src/carplay/**',
                '@/app/**',
                'react-native',
                'expo-*',
              ],
              message: 'domain must stay pure.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/cast/**/*.{ts,tsx}'],
    ignores: ['src/cast/**/*.test.ts', 'src/cast/providers/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/src/player/playlistEngine',
              message: 'Cast must use outputPolicy, not playlistEngine.',
            },
            {
              name: '@/src/store/library',
              message: 'Cast must not import library store.',
            },
            {
              name: '@/src/store/session',
              message: 'Cast must not import session store.',
            },
            {
              name: '@/src/store/settings',
              message: 'Cast must not import settings store.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/cast/providers/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/src/player/playlistEngine',
              message: 'Cast must use outputPolicy, not playlistEngine.',
            },
          ],
        },
      ],
    },
  },
])
