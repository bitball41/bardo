import {
  PUBLIC_WISP_SERVERS,
  SHERPA_RUNTIME,
  SVC_PREFIX,
  SVC_PREFIX_KLYSTRON,
  SVC_PREFIX_SHERPA,
} from "./lib/constants";
import { waitForServiceWorkerActivation } from "./lib/service-worker";
import { BAREMUX_WORKER, TRANSPORTS } from "./lib/transport";
import type { EngineName, ScramjetFrame } from "./lib/types";
import { decodeProxyPath, encodeProxyPath, pathCodec } from "../shared/url-codec";

type EmbedCommand = "navigate" | "reload" | "back" | "forward";

interface CommandMessage {
  type?: string;
  channel?: string;
  command?: EmbedCommand;
  url?: string;
}

const params = new URLSearchParams(location.search);
const requestedEngine = params.get("engine");
const engine: EngineName = requestedEngine === "scramjet" || requestedEngine === "klystron"
  ? requestedEngine
  : "sherpa";
const channel = params.get("channel") || "standalone";
const iframe = document.getElementById("proxy-frame") as HTMLIFrameElement;
const status = document.getElementById("status") as HTMLDivElement;
let frame: ScramjetFrame | null = null;

function send(type: string, extra: Record<string, unknown> = {}) {
  if (parent === window) return;
  parent.postMessage({ type, channel, ...extra }, "*");
}

function decodeTarget(encoded: string) {
  if (!encoded) return "";
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function checkWisp(url: string, timeoutMs = 4500) {
  return new Promise<boolean>((resolve) => {
    let socket: WebSocket;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { socket.close(); } catch {}
      resolve(ok);
    };
    try {
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
    } catch {
      resolve(false);
      return;
    }
    const timeout = setTimeout(() => finish(false), timeoutMs);
    socket.addEventListener("message", () => finish(true));
    socket.addEventListener("error", () => finish(false));
    socket.addEventListener("close", () => finish(false));
  });
}

async function setupTransport() {
  const connection = new window.BareMux.BareMuxConnection(BAREMUX_WORKER);
  const localWisp = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/wisp/`;
  const candidates = [localWisp, ...PUBLIC_WISP_SERVERS];

  for (const wisp of candidates) {
    if (!(await checkWisp(wisp))) continue;
    for (const transport of TRANSPORTS) {
      try {
        await connection.setTransport(transport.path, [transport.options(wisp)]);
        return;
      } catch (error) {
        console.warn(`[bardo embed] ${transport.id} failed`, error);
      }
    }
  }
  throw new Error("No Wisp server is reachable.");
}

async function registerWorker(script: string, scope: string) {
  const registration = await navigator.serviceWorker.register(script, {
    scope,
    updateViaCache: "none",
  });
  const replacement = registration.installing ?? registration.waiting;
  if (!replacement) {
    if (registration.active) return;
    throw new Error("The proxy service worker did not start.");
  }
  if (registration.waiting === replacement) replacement.postMessage({ type: "SKIP_WAITING" });
  await waitForServiceWorkerActivation(replacement, () => registration.active === replacement);
}

async function createClientFrame(): Promise<ScramjetFrame> {
  await setupTransport();

  if (engine === "scramjet") {
    const { ScramjetController } = window.$scramjetLoadController();
    const controller = new ScramjetController({
      prefix: SVC_PREFIX,
      files: {
        wasm: "/scramjet/scramjet.wasm.wasm",
        all: "/scramjet/scramjet.all.js",
        sync: "/scramjet/scramjet.sync.js",
      },
      flags: { sourcemaps: false, captureErrors: false },
      codec: pathCodec,
    });
    await Promise.all([controller.init(), registerWorker("/sw.js", SVC_PREFIX)]);
    return controller.createFrame(iframe);
  }

  const { SherpaController } = window.$sherpaLoadController();
  const controller = new SherpaController({
    prefix: SVC_PREFIX_SHERPA,
    files: {
      wasm: SHERPA_RUNTIME.wasm,
      all: SHERPA_RUNTIME.client,
      sync: SHERPA_RUNTIME.sync,
    },
    globals: {
      wrapfn: "$scramjet$wrap",
      wrappropertybase: "$scramjet__",
      wrappropertyfn: "$scramjet$prop",
      cleanrestfn: "$scramjet$clean",
      importfn: "$scramjet$import",
      rewritefn: "$scramjet$rewrite",
      metafn: "$scramjet$meta",
      setrealmfn: "$scramjet$setrealm",
      pushsourcemapfn: "$scramjet$pushsourcemap",
      trysetfn: "$scramjet$tryset",
      templocid: "$scramjet$temploc",
      tempunusedid: "$scramjet$tempunused",
    },
    errorPage: { title: "This page didn't load", repoUrl: "", logo: "" },
    flags: { sourcemaps: false, captureErrors: false },
    codec: pathCodec,
  });
  await Promise.all([controller.init(), registerWorker("/sw-sherpa.js", SVC_PREFIX_SHERPA)]);
  return controller.createFrame(iframe);
}

class KlystronFrame implements ScramjetFrame {
  private listeners: Array<(event: { url: string }) => void> = [];

  constructor() {
    iframe.addEventListener("load", () => {
      try {
        const url = decodeProxyPath(SVC_PREFIX_KLYSTRON, iframe.contentWindow?.location.href || "");
        if (url) this.listeners.forEach((listener) => listener({ url }));
      } catch {}
    });
  }

  go(url: string) { iframe.src = encodeProxyPath(SVC_PREFIX_KLYSTRON, url); }
  reload() { iframe.contentWindow?.location.reload(); }
  back() { iframe.contentWindow?.history.back(); }
  forward() { iframe.contentWindow?.history.forward(); }
  addEventListener(type: "urlchange", listener: (event: { url: string }) => void) {
    if (type === "urlchange") this.listeners.push(listener);
  }
}

function runCommand(command: EmbedCommand, url?: string) {
  if (!frame) return;
  if (command === "navigate" && url && /^https?:\/\//i.test(url)) frame.go(url);
  else if (command === "reload") frame.reload();
  else if (command === "back") frame.back();
  else if (command === "forward") frame.forward();
}

window.addEventListener("message", (event: MessageEvent<CommandMessage>) => {
  if (event.source !== parent || event.data?.type !== "bardo-embed:command") return;
  if (event.data.channel !== channel || !event.data.command) return;
  runCommand(event.data.command, event.data.url);
});

async function boot() {
  const target = decodeTarget(location.hash.slice(1));
  if (!/^https?:\/\//i.test(target)) throw new Error("The requested address is invalid.");

  frame = engine === "klystron" ? new KlystronFrame() : await createClientFrame();
  frame.addEventListener("urlchange", (event) => send("bardo-embed:url", { url: event.url }));
  status.hidden = true;
  iframe.hidden = false;
  send("bardo-embed:ready", { engine });
  frame.go(target);
}

boot().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  status.textContent = `Bardo could not start this tab. ${message}`;
  send("bardo-embed:error", { message });
});
