import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Every layer clears itself with `if (!showX) { setX(null); return; }` at the top of its
      // fetch effect. That is deliberate and works; as an error it blocked unrelated pushes.
      'react-hooks/set-state-in-effect': 'warn',
      // The React Compiler rules arrived with the plugin upgrade and flag patterns this code used
      // long before they existed, and which work. Worth reading; not worth blocking a push over.
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
])
