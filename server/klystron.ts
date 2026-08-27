// Klystron — a server-side proxy engine for Bardo.
//
// Unlike Scramjet (which intercepts and rewrites everything client-side via a
// service worker + wasm), Klystron does the work on the server: it fetches the
// target URL with Node's `fetch`, rewrites every URL in the returned
// HTML/CSS/JS so it points back through `/klystron/<opaque-dest>`, and streams the
// result to the iframe. A small companion service worker (sw-klystron.js)
// catches the runtime requests the static rewrite can't see (fetch/XHR, dynamic
// elements) and routes those back through here too.
//
// Ported from https://github.com/IHATECAMOUFLAGE/Klystron and adapted for Bardo:
// the upstream `main` ↔ `fetch` response-shape mismatch is fixed, the response
// header allow-list drops `content-length`/`x-frame-options` (we re-frame and
// re-length the body), CSP is stripped per-response, and basic SSRF guards block
// requests at private/loopback hosts. The SSRF guard, header handling, and URL
// rewriter live in ./proxy-shared.ts so the server-side engine gets a single
// copy of those protections.

import express, { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Duplex } from "node:stream";
import { CookieJar } from "tough-cookie";
import {
  assertSafeHost,
  copyResponseHeaders,
  fetchUpstream,
  isBlockedHost,
  isTextual,
  rewrite,
  type Upstream,
} from "./proxy-shared.js";
import { decodeDest } from "../shared/url-codec.js";

export const KLYSTRON_PREFIX = "/klystron/";

// ---------------------------------------------------------------------------
// Per-session cookie jars. The browser holds an opaque `klystron_session` id;
// each id maps to a server-side CookieJar so logins persist across requests.
// ---------------------------------------------------------------------------

const jars = new Map<string, CookieJar>();
const SESSION_COOKIE = "klystron_session";
const MAX_JARS = 1000;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header ?? "").split(";")) {
    const s = part.trim();
    if (!s) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return out;
}

function getSessionJar(req: Request, res: Response): CookieJar {
  const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (id && jars.has(id)) return jars.get(id)!;

  const fresh = randomUUID();
  jars.set(fresh, new CookieJar(undefined, { looseMode: true }));
  if (jars.size > MAX_JARS) {
    const oldest = jars.keys().next().value;
    if (oldest) jars.delete(oldest);
  }
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${fresh}; Path=/; HttpOnly; SameSite=Lax`);
  return jars.get(fresh)!;
}

// ---------------------------------------------------------------------------
// Response handling: stream binaries through untouched, rewrite text.
// ---------------------------------------------------------------------------

async function handle(req: Request, res: Response): Promise<void> {
  let target: string;
  try {
    const raw = req.url.replace(/^\/+/, "").split("#")[0].split("?")[0];
    if (!raw) { res.status(400).type("text/plain").send("Klystron: missing target URL"); return; }
    target = decodeDest(raw);
  } catch {
    res.status(400).type("text/plain").send("Klystron: malformed target URL");
    return;
  }

  let parsed: URL;
  try { parsed = new URL(target); } catch {
    res.status(400).type("text/plain").send("Klystron: invalid URL");
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).type("text/plain").send("Klystron: only http(s) is supported");
    return;
  }
  if (isBlockedHost(parsed.hostname)) {
    res.status(403).type("text/plain").send("Klystron: blocked host");
    return;
  }

  const jar = getSessionJar(req, res);
  const bodyBuf = Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined;

  let upstream: Upstream;
  try {
    upstream = await fetchUpstream(target, req, jar, bodyBuf, KLYSTRON_PREFIX);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(502).type("text/plain").send(`Klystron upstream error: ${message}`);
    return;
  }

  const { res: ures, finalUrl } = upstream;
  const contentType = ures.headers.get("content-type") || "application/octet-stream";

  // Drop the security headers Bardo's global middleware added — proxied content
  // is same-origin and must be framable and free of our app's CSP.
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Frame-Options");
  copyResponseHeaders(res, ures.headers);
  res.status(ures.status);
  res.setHeader("Content-Type", contentType);

  if (!isTextual(contentType) || contentType.toLowerCase().startsWith("text/event-stream")) {
    if (!ures.body) { res.end(); return; }
    Readable.fromWeb(ures.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    return;
  }

  const text = await ures.text();
  res.send(rewrite(finalUrl, text, contentType, KLYSTRON_PREFIX));
}

// ---------------------------------------------------------------------------
// WebSocket upgrade passthrough for /klystron/<encoded-ws-url>.
// ---------------------------------------------------------------------------

function parseUpgradeTarget(reqUrl: string | undefined): string | null {
  if (!reqUrl || !reqUrl.startsWith(KLYSTRON_PREFIX)) return null;
  try {
    const decoded = decodeDest(reqUrl.slice(KLYSTRON_PREFIX.length));
    return decoded || null;
  } catch {
    return null;
  }
}

export function klystronUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const target = parseUpgradeTarget(req.url);
  if (!target) { socket.destroy(); return; }

  let remote: URL;
  try { remote = new URL(target); } catch { socket.destroy(); return; }

  // Resolve-and-check the target — not just a literal-IP check — so a hostname
  // that resolves to an internal address can't open a tunnel to the LAN.
  assertSafeHost(remote.hostname).then(() => {
    const secure = remote.protocol === "wss:" || remote.protocol === "https:";
    const headers = { ...req.headers, host: remote.host };
    delete headers["content-length"];

    const proxyReq = (secure ? httpsRequest : httpRequest)({
      protocol: secure ? "https:" : "http:",
      hostname: remote.hostname,
      port: remote.port || (secure ? 443 : 80),
      path: remote.pathname + remote.search,
      method: req.method,
      headers,
    });

    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      socket.write(`HTTP/1.1 101 ${proxyRes.statusMessage || "Switching Protocols"}\r\n`);
      for (const [name, value] of Object.entries(proxyRes.headers)) {
        if (value == null) continue;
        for (const item of Array.isArray(value) ? value : [value]) socket.write(`${name}: ${item}\r\n`);
      }
      socket.write("\r\n");
      if (proxyHead?.length) proxySocket.write(proxyHead);
      if (head?.length) proxySocket.write(head);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
      proxySocket.on("error", () => socket.destroy());
      socket.on("error", () => proxySocket.destroy());
    });
    proxyReq.on("error", () => socket.destroy());
    proxyReq.end();
  }).catch(() => socket.destroy());
}

// ---------------------------------------------------------------------------
// Express router, mounted at /klystron.
// ---------------------------------------------------------------------------

export function klystronRouter(): Router {
  const router = Router();
  // Buffer the request body so POSTs (and redirect replays) keep their payload.
  router.use(express.raw({ type: () => true, limit: "25mb" }));
  router.all(/.*/, (req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) { res.destroy(); return; }
      const message = err instanceof Error ? err.message : "unknown error";
      res.status(500).type("text/plain").send(`Klystron error: ${message}`);
    });
  });
  return router;
}
