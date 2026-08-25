import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const EXPRESS = 'http://localhost:8080';
const passthrough = [
  '/api',
  '/sherpa',
  '/runtime',
  '/scramjet',
  '/baremux',
  '/epoxy',
  '/libcurl',
  '/klystron',
  '/opulent',
  '/sw.js',
  '/sw-sherpa.js',
  '/sw-klystron.js',
  '/sw-opulent.js',
  '/shortcuts.json',
  '/ab-launcher.js',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
];

export default defineConfig({
  plugins: [
    preact({ devToolsEnabled: false }),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  publicDir: false,
  server: {
    port: 5173,
    proxy: {
      ...Object.fromEntries(
        passthrough.map((p) => [p, { target: EXPRESS, changeOrigin: true }]),
      ),
      '/wisp': { target: EXPRESS.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
