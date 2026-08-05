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
          selector: "VariableDeclaration[kind='let']",
          message: 'Use const.',
        },
        {
          selector: 'ForStatement',
          message: 'No for loops.',
        },
        {
          selector: 'ForInStatement',
          message: 'No for...in.',
        },
        {
          selector: 'ForOfStatement',
          message: 'No for...of.',
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
])
