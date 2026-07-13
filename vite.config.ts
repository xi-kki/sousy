import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte()
  ],
  base: './',
  resolve: {
    alias: {
      "@": path.resolve("./src"),
      "@app": path.resolve("./src/app"),
      "@features": path.resolve("./src/features"),
      "@shared": path.resolve("./src/shared"),
      "@lib": path.resolve("./src/lib"),
      "@assets": path.resolve("./src/assets"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
