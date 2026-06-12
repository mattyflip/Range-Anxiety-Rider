import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@react-google-maps')) {
              return 'vendor-google';
            }
            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            return 'vendor-libs';
          }
        }
      }
    }
  },
  optimizeDeps: {
    include: ['recharts']
  }
})
