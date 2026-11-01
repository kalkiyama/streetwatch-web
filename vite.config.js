import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // DuckDuckGo's desktop browser could not PARSE the lazily-loaded OrbitControls chunk —
    // "SyntaxError: Unexpected token '{'" — while Safari and Firefox ran it fine. The file
    // downloaded correctly; its syntax was simply newer than that engine. Vite's default target
    // assumes a modern baseline, and three.js ships class fields that fall outside it.
    //
    // Both globe tabs are lazy chunks, which is why those two crashed and the other three did
    // not: a chunk that fails to PARSE rejects the lazy import, and Suspense handles the loading
    // state but not the failing one.
    //
    // es2020 plus explicit floors transpiles what that engine rejects. The cost is a slightly
    // larger bundle, which is the right trade for a tab that currently takes the whole app down.
    target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'],
  },
})
