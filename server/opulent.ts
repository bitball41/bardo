// OpulentAPI — a second server-side proxy engine for Bardo, alongside Klystron.
//
// Loosely inspired by https://github.com/IHATECAMOUFLAGE/opulentapi (by the
// same author as Klystron), but rebuilt on Bardo's own safe primitives rather
// than ported verbatim: the upstream project disables TLS certificate
// validation on every outbound request, has no SSRF guard at all, and its
// Ultraviolet mode hardcodes a third-party "bare" server on an unvetted
// domain. None of that is carried over here — this engine reuses the same
// SSRF guard, header handling, and jsdom rewriter as Klystron (./proxy-shared.ts).
//
// The one capability worth keeping from upstream is rendering JS-heavy pages
// through headless Chromium when a plain fetch only returns an empty
// client-rendered shell. That render path is opt-in per-request (triggered by
// a heuristic, not always-on), lazily imports `puppeteer` so it costs nothing
// until it's actually used, and never keeps a browser resident between
// requests.

import express, { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Duplex } from "node:stream";
import { CookieJar } from "tough-cookie";
import { JSDOM } from "jsdom";
import {
  assertSafeHost,
  copyResponseHeaders,
  fetchUpstream,
  isBlockedHost,
  isTextual,
  rewrite,
  type Upstream,
} from "./proxy-shared.js";

export const OPULENT_PREFIX = "/opulent/";

// ---------------------------------------------------------------------------
// Per-session cookie jars — same pattern as Klystron, kept separate so the two
// engines don't share login state.
// ---------------------------------------------------------------------------

const jars = new Map<string, CookieJar>();
const SESSION_COOKIE = "opulent_session";
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
// Headless-render fallback for JS-heavy pages. Lazily imports `puppeteer` so
// it's never loaded — and Chromium never launched — unless a page actually
// needs it. No persistent browser pool: each call launches, renders, closes.
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;

// A static fetch that comes back this thin, with scripts present, looks like
// an unrendered client-side-rendered shell rather than real content.
const SHELL_TEXT_THRESHOLD = 150;

function looksLikeEmptyShell(document: Document): boolean {
  const text = document.body?.textContent?.trim() ?? "";
  if (text.length >= SHELL_TEXT_THRESHOLD) return false;
  return document.querySelectorAll("script").length > 0;
}

async function renderWithBrowser(target: string): Promise<string | null> {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) return null;

  const parsed = new URL(target);
  if (isBlockedHost(parsed.hostname)) return null;

  activeRenders++;
  let browser: import("puppeteer").Browser | undefined;
  try {
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.goto(target, { waitUntil: "networkidle2", timeout: 15000 });
    return await page.content();
  } catch {
    return null;
  } finally {
    activeRenders--;
    try { await browser?.close(); } catch { /* already gone */ }
  }
}

// ---------------------------------------------------------------------------
// Response handling: stream binaries through untouched, rewrite text — with a
// headless-render fallback for pages that come back as an empty JS shell.
// ---------------------------------------------------------------------------

async function handle(req: Request, res: Response): Promise<void> {
  let target: string;
  try {
    const raw = req.url.replace(/^\/+/, "").split("#")[0];
    if (!raw) { res.status(400).type("text/plain").send("OpulentAPI: missing target URL"); return; }
    target = decodeURIComponent(raw);
  } catch {
    res.status(400).type("text/plain").send("OpulentAPI: malformed target URL");
    return;
  }

  let parsed: URL;
  try { parsed = new URL(target); } catch {
    res.status(400).type("text/plain").send("OpulentAPI: invalid URL");
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).type("text/plain").send("OpulentAPI: only http(s) is supported");
    return;
  }
  if (isBlockedHost(parsed.hostname)) {
    res.status(403).type("text/plain").send("OpulentAPI: blocked host");
    return;
  }

  const jar = getSessionJar(req, res);
  const bodyBuf = Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined;

  let upstream: Upstream;
  try {
    upstream = await fetchUpstream(target, req, jar, bodyBuf, OPULENT_PREFIX);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(502).type("text/plain").send(`OpulentAPI upstream error: ${message}`);
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

  let text = await ures.text();

  if (req.method.toUpperCase() === "GET" && contentType.toLowerCase().includes("text/html")) {
    const dom = new JSDOM(text, { url: finalUrl });
    if (looksLikeEmptyShell(dom.window.document)) {
      const rendered = await renderWithBrowser(finalUrl);
      if (rendered) text = rendered;
    }
  }

  res.send(rewrite(finalUrl, text, contentType, OPULENT_PREFIX));
}

// ---------------------------------------------------------------------------
// WebSocket upgrade passthrough for /opulent/<encoded-ws-url>.
// ---------------------------------------------------------------------------

function parseUpgradeTarget(reqUrl: string | undefined): string | null {
  if (!reqUrl || !reqUrl.startsWith(OPULENT_PREFIX)) return null;
  try { return decodeURIComponent(reqUrl.slice(OPULENT_PREFIX.length)); } catch { return null; }
}

export function opulentUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
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
// Express router, mounted at /opulent.
// ---------------------------------------------------------------------------

export function opulentRouter(): Router {
  const router = Router();
  // Buffer the request body so POSTs (and redirect replays) keep their payload.
  router.use(express.raw({ type: () => true, limit: "25mb" }));
  router.all(/.*/, (req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) { res.destroy(); return; }
      const message = err instanceof Error ? err.message : "unknown error";
      res.status(500).type("text/plain").send(`OpulentAPI error: ${message}`);
    });
  });
  return router;
}
