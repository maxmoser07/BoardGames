import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // /api wird an das Rust-Backend (backend/src/main.rs) weitergereicht.
    // Die Session-IDs im Pfad (/connectfour/:id) liefert der Dev-Server
    // automatisch über den SPA-Fallback aus.
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
