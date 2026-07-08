import express, { type RequestHandler } from "express";
import compression from "compression";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { sherpaPath } from "sherpa/path";
import { klystronRouter, klystronUpgrade } from "./server/klystron.js";
import { opulentRouter, opulentUpgrade } from "./server/opulent.js";

const app = express();
const rootDir = __dirname;

app.use(compression());

// Klystron and OpulentAPI are server-side proxies: they serve rewritten remote
// pages from Bardo's own origin, so they must run ahead of the global security
// headers below (a strict CSP + no-referrer would break proxied content). They
// set their own headers.
app.use("/klystron", klystronRouter());
app.use("/opulent", opulentRouter());

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "connect-src 'self' wss: https:",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "img-src 'self' data: https:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join("; ");

app.use((_request, response, next) => {
  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

const allowServiceWorker: RequestHandler = (_request, response, next) => {
  response.setHeader("Service-Worker-Allowed", "/");
  next();
};

const revalidate: RequestHandler = (_request, response, next) => {
  response.setHeader("Cache-Control", "no-cache");
  next();
};

const cacheProxyRuntime: RequestHandler = (_request, response, next) => {
  response.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  next();
};

function proxyStatic(packagePath: string) {
  return runtimeStatic(path.join(rootDir, packagePath));
}

function runtimeStatic(directory: string) {
  return express.static(directory, {
    cacheControl: false,
    etag: true,
  });
}

app.use("/sherpa/", allowServiceWorker, cacheProxyRuntime, runtimeStatic(sherpaPath));
app.use(
  "/scramjet/",
  allowServiceWorker,
  cacheProxyRuntime,
  proxyStatic("node_modules/@mercuryworkshop/scramjet/dist"),
);
app.use(
  "/baremux/",
  cacheProxyRuntime,
  proxyStatic("node_modules/@mercuryworkshop/bare-mux/dist"),
);

app.get("/epoxy/index.mjs", cacheProxyRuntime, (_request, response) => {
  response.type("application/javascript");
  response.sendFile(
    path.join(rootDir, "node_modules/@mercuryworkshop/epoxy-transport/dist/index.mjs"),
    { cacheControl: false },
  );
});

app.get("/libcurl/index.mjs", cacheProxyRuntime, (_request, response) => {
  response.type("application/javascript");
  response.sendFile(
    path.join(rootDir, "node_modules/@mercuryworkshop/libcurl-transport/dist/index.mjs"),
    { cacheControl: false },
  );
});

app.get("/sw.js", allowServiceWorker, revalidate, (_request, response) => {
  response.sendFile(path.join(rootDir, "public/sw.js"), { cacheControl: false });
});
app.get("/sw-sherpa.js", allowServiceWorker, revalidate, (_request, response) => {
  response.sendFile(path.join(rootDir, "public/sw-sherpa.js"), { cacheControl: false });
});
app.get("/sw-klystron.js", allowServiceWorker, revalidate, (_request, response) => {
  response.sendFile(path.join(rootDir, "public/sw-klystron.js"), { cacheControl: false });
});
app.get("/sw-opulent.js", allowServiceWorker, revalidate, (_request, response) => {
  response.sendFile(path.join(rootDir, "public/sw-opulent.js"), { cacheControl: false });
});
app.get("/shortcuts.json", revalidate, (_request, response) => {
  response.sendFile(path.join(rootDir, "public/shortcuts.json"), { cacheControl: false });
});
app.get("/ab-launcher.js", revalidate, (_request, response) => {
  response.type("application/javascript");
  response.sendFile(path.join(rootDir, "public/ab-launcher.js"), { cacheControl: false });
});
app.get("/manifest.json", revalidate, (_request, response) => {
  response.type("application/manifest+json");
  response.sendFile(path.join(rootDir, "public/manifest.json"), { cacheControl: false });
});
for (const icon of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-512-maskable.png"]) {
  app.get(`/${icon}`, cacheProxyRuntime, (_request, response) => {
    response.sendFile(path.join(rootDir, "public", icon), { cacheControl: false });
  });
}

const distRoot = path.join(rootDir, "dist");
const distIndex = path.join(distRoot, "index.html");
if (!existsSync(distIndex)) {
  throw new Error("Missing dist/index.html. Run npm run build before starting Bardo.");
}

app.use(
  express.static(distRoot, {
    setHeaders(response, filePath) {
      const isHashedAsset = path.relative(distRoot, filePath).startsWith(`assets${path.sep}`);
      response.setHeader(
        "Cache-Control",
        isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
      );
    },
  }),
);

const server = createServer(app);
server.on("upgrade", (request, socket, head) => {
  const host = request.headers.host;
  const origin = request.headers.origin;

  let pathName = "";
  let sameOrigin = false;
  try {
    pathName = new URL(request.url ?? "", `http://${host}`).pathname;
    sameOrigin = !!origin && !!host && new URL(origin).host === host;
  } catch {}

  // Klystron and OpulentAPI proxy WebSocket upgrades for proxied pages
  // (same-origin only).
  if (pathName.startsWith("/klystron/")) {
    if (sameOrigin) klystronUpgrade(request, socket, head as Buffer);
    else socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  if (pathName.startsWith("/opulent/")) {
    if (sameOrigin) opulentUpgrade(request, socket, head as Buffer);
    else socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }

  if (!(pathName === "/wisp/" && sameOrigin)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }

  wisp.routeRequest(request, socket, head);
});

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
server.listen(port, () => {
  console.log(`\nBardo  →  http://localhost:${port}\n`);
});
