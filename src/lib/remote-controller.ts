import { remoteOrigin } from "./constants";
import type { EngineName, ScramjetFrame } from "./types";

type FrameListener = (event: { url: string }) => void;

interface EmbedMessage {
  type?: string;
  channel?: string;
  url?: string;
}

function randomChannel() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeTarget(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function remoteEmbedUrl(engine: EngineName, target: string, channel = randomChannel()) {
  const query = new URLSearchParams({ engine, channel });
  return `${remoteOrigin()}/embed.html?${query}#${encodeTarget(target)}`;
}

class RemoteFrame implements ScramjetFrame {
  private listeners: FrameListener[] = [];
  private ready = false;
  private currentUrl = "";
  private loadedUrl = "";
  private readonly channel = randomChannel();
  private readonly iframe: HTMLIFrameElement;
  private readonly engine: EngineName;

  constructor(iframe: HTMLIFrameElement, engine: EngineName) {
    this.iframe = iframe;
    this.engine = engine;
    window.addEventListener("message", this.onMessage);
  }

  private onMessage = (event: MessageEvent<EmbedMessage>) => {
    if (!this.iframe.isConnected) {
      window.removeEventListener("message", this.onMessage);
      return;
    }
    if (event.origin !== remoteOrigin() || event.source !== this.iframe.contentWindow) return;
    if (event.data?.channel !== this.channel) return;

    if (event.data.type === "bardo-embed:ready") {
      this.ready = true;
      if (this.currentUrl && this.currentUrl !== this.loadedUrl) this.send("navigate", this.currentUrl);
      return;
    }
    if (event.data.type === "bardo-embed:url" && event.data.url) {
      this.currentUrl = event.data.url;
      this.loadedUrl = event.data.url;
      for (const listener of this.listeners) listener({ url: event.data.url });
    }
  };

  private send(command: "navigate" | "reload" | "back" | "forward", url?: string) {
    this.iframe.contentWindow?.postMessage(
      { type: "bardo-embed:command", channel: this.channel, command, url },
      remoteOrigin(),
    );
  }

  go(url: string) {
    this.currentUrl = url;
    if (!this.iframe.src || this.iframe.src === "about:blank") {
      this.loadedUrl = url;
      this.iframe.src = remoteEmbedUrl(this.engine, url, this.channel);
    } else if (this.ready) {
      this.send("navigate", url);
    }
  }

  reload() {
    if (this.ready) this.send("reload");
  }

  back() {
    if (this.ready) this.send("back");
  }

  forward() {
    if (this.ready) this.send("forward");
  }

  addEventListener(type: "urlchange", listener: FrameListener) {
    if (type === "urlchange") this.listeners.push(listener);
  }
}

export class RemoteController {
  private readonly engine: EngineName;

  constructor(engine: EngineName) {
    this.engine = engine;
  }

  encodeUrl(url: string) {
    return remoteEmbedUrl(this.engine, url);
  }

  decodeUrl(url: string) {
    return url;
  }

  createFrame(iframe: HTMLIFrameElement): ScramjetFrame {
    return new RemoteFrame(iframe, this.engine);
  }

  async init() {}
}
