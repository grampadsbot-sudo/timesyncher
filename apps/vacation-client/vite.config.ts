import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react-dom/client': resolve(__dirname, 'node_modules/react-dom/client'),
      leaflet: resolve(__dirname, 'node_modules/leaflet'),
      'react-leaflet': resolve(__dirname, 'node_modules/react-leaflet'),
    },
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(repoRoot, 'vacation-app-next.html'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.TSV_PREVIEW_API_ORIGIN || 'https://vacation-staging.timesyncher.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  preview: {
    port: 4174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.TSV_PREVIEW_API_ORIGIN || 'https://vacation-staging.timesyncher.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
