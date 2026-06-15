import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version),
  },
  build: {
    chunkSizeWarningLimit: 2000
  },
  optimizeDeps: {
    include: ['recharts']
  }
})
