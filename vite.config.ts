import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync, createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EXPRESS = 'http://localhost:8080';
const PUBLIC_ICONS = [
  'bardo-favicon-inverted.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
];
const passthrough = [
  '/api',
  '/sherpa',
  '/scramjet',
  '/baremux',
  '/epoxy',
  '/libcurl',
  '/klystron',
  '/sw.js',
  '/sw-sherpa.js',
  '/sw-klystron.js',
  '/shortcuts.json',
  '/ab-launcher.js',
  '/manifest.json',
  ...PUBLIC_ICONS.map((name) => `/${name}`),
];

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function bardoPublicIcons(): Plugin {
  const root = path.resolve(__dirname, 'public');
  return {
    name: 'bardo-public-icons',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const name = url.replace(/^\//, '');
        if (!PUBLIC_ICONS.includes(name)) return next();
        const file = path.join(root, name);
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', MIME[path.extname(name)] || 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist');
      for (const name of PUBLIC_ICONS) {
        const from = path.join(root, name);
        if (existsSync(from)) copyFileSync(from, path.join(dist, name));
      }
      // Stable remote entrypoint used by the one-file launcher. The generated
      // document keeps root-relative runtime URLs on Bardo's HTTPS origin.
      copyFileSync(path.join(dist, 'index.html'), path.join(dist, 'bardo.html'));
      copyFileSync(path.resolve(__dirname, 'Bardo.html'), path.join(dist, 'Bardo.html'));

      // The downloaded Bardo.html imports these two stable, no-cache URLs.
      // The tiny JS shim points at Vite's hashed entry, whose relative dynamic
      // imports continue to resolve on the remote HTTPS origin.
      const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
      const entry = html.match(/<script type="module"[^>]*src="([^"]+)"/i)?.[1];
      const css = Array.from(html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/gi))
        .map((match) => match[1])
        .find((href) => href.startsWith('/assets/'));
      if (!entry || !css) throw new Error('Could not find Vite entry assets');
      writeFileSync(path.join(dist, 'bardo-app.js'), `import ${JSON.stringify(entry)};\n`);
      writeFileSync(
        path.join(dist, 'bardo-app.css'),
        `@import url("https://fonts.googleapis.com/css2?family=Unbounded:wght@400..800&display=swap");\n@import url(${JSON.stringify(css)});\n`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    preact({ devToolsEnabled: false }),
    tailwindcss(),
    bardoPublicIcons(),
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
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        embed: path.resolve(__dirname, 'embed.html'),
      },
    },
  },
});
