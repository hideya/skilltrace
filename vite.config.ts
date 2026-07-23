import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import devtoolsJson from './app/lib/vite-devtools-json'

export default defineConfig({
  build: {
    rollupOptions: {
      onLog(level, log, handler) {
        // Resource routes intentionally produce empty client chunks.
        if (log.code !== 'EMPTY_BUNDLE') handler(level, log)
      },
    },
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  server: {
    watch: {
      ignored: ['**/tmp/**', '**/data/**'],
    },
  },
  plugins: [reactRouter(), tailwindcss(), devtoolsJson()],
})
