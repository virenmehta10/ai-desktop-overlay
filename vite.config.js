import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // Use relative paths for assets in packaged apps
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    host: true,
  },
  clearScreen: false,
  build: {
    outDir: 'build',
    assetsDir: 'assets',
  },
  // Don't load .env files during build (they're handled by server.js at runtime)
  envPrefix: [],
  envDir: '.', // Set to current dir but envPrefix: [] prevents loading
});

