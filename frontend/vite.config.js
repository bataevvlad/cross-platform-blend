import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages (change 'cross-platform-blend' to your repo name)
  base: process.env.NODE_ENV === 'production' ? '/cross-platform-blend/' : '/',
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  }
})
