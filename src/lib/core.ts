import {
  ACCENTS,
  DEFAULT_SETTINGS,
  ENGINE_BY_ID,
  HISTORY_KEY,
  HISTORY_MAX,
  NOTES_KEY,
  PUBLIC_WISP_SERVERS,
  SEARCH_ENGINES,
  SESSION_KEY,
  SETTINGS_KEY,
  SHORTCUTS_KEY,
  TAB_CLOAKS,
  TAB_GROUPS_KEY,
  SVC_PREFIX,
  SVC_PREFIX_SHERPA,
  SVC_PREFIX_KLYSTRON,
  SHERPA_RUNTIME,
  THEMES,
  TODOS_KEY,
} from "./constants";
import type {
  Bookmark,
  CustomTheme,
  EngineName,
  HistoryEntry,
  InternalTab,
  Settings,
  SavedTabGroup,
  Shortcut,
  TabGroup,
  TabView,
  ScramjetController,
  ScramjetControllerFactory,
  SherpaController,
  SherpaControllerFactory,
  BareMuxConnection,
} from "./types";
import {
  DEFAULT_TOOLBAR,
  loadToolbar,
  makeEntry,
  sanitizeToolbarIds,
  saveToolbar,
  toEntries,
  type ToolbarEntry,
  type ToolbarItemId,
} from "./toolbar";
import { loadCustomThemes, MAX_CUSTOM_THEMES, sanitizeCustomTheme, saveCustomThemes } from "./customThemes";
import { toast } from "./toast";
import { logEvent, recordConnectionSuccess, recordEngineRestart } from "./diagnostics";
import { decodeDest, decodeProxyPath, encodeProxyPath, pageLabel, pathCodec } from "../../shared/url-codec";

declare global {
  interface Window {
    BareMux: { BareMuxConnection: new (worker: string) => BareMuxConnection };
    $scramjetLoadController: () => ScramjetControllerFactory;
    $sherpaLoadController: () => SherpaControllerFactory;
    __bardoCtrl?: ScramjetController | SherpaController | { _prefix: string; encodeUrl(url: string): string; decodeUrl(url: string): string; createFrame: (iframe: HTMLIFrameElement) => PrefixFrame };
    eruda?: { init(): void; show(): void; hide(): void };
  }
}

export type ProgressPhase = "idle" | "active" | "done";

export interface Snapshot {
  tabs: TabView[];
  activeId: number | null;
  activeUrl: string;
  showNewTab: boolean;
  canBack: boolean;
  canFwd: boolean;
  status: string;
  statusWarn: boolean;
  progress: ProgressPhase;
  settings: Settings;
  history: HistoryEntry[];
  shortcuts: Shortcut[];
  toolbar: ToolbarEntry[];
  customThemes: CustomTheme[];
  tabGroups: TabGroup[];
  savedTabGroups: SavedTabGroup[];
  ctrlReady: boolean;
  capabilitiesReady: boolean;
  engineSupport: Record<EngineName, boolean>;
  deploymentMode: "server" | "frontend-preview";
  abLaunched: boolean;
  abBlocked: boolean;
  /** Host of the Wisp server currently in use; null for server-side engines. */
  wispUrl: string | null;
}

class BardoCore {
  private settings: Settings = this.loadSettings();
  private tabs: InternalTab[] = [];
  private activeTabId: number | null = null;
  private nextTabId = 0;
  private host: HTMLElement | null = null;
  private restoring = false;
  private booted = false;

  private status = "";
  private statusWarn = false;
  private progress: ProgressPhase = "idle";
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private ctrlReady = false;
  private pendingUrl: string | null = null;

  private conn: BareMuxConnection | null = null;
  private activeSWReg: ServiceWorkerRegistration | null = null;
  private swUpdateDebounce: ReturnType<typeof setTimeout> | null = null;
  private swUpdateScheduled = false;
  private wispUrl: string | null = null;
  private capabilitiesReady = false;
  private engineSupport: Record<EngineName, boolean> = {
    sherpa: false,
    scramjet: false,
    klystron: false,
  };
  private deploymentMode: "server" | "frontend-preview" = "frontend-preview";

  private history: HistoryEntry[] = this.loadHistory();
  private shortcuts: Shortcut[] = [];
  private toolbar: ToolbarEntry[] = toEntries(loadToolbar());
  private customThemes: CustomTheme[] = loadCustomThemes();
  private tabGroups: TabGroup[] = [];
  private savedTabGroups: SavedTabGroup[] = this.loadSavedTabGroups();

  private listeners = new Set<() => void>();
  private snapshot: Snapshot = this.buildSnapshot();

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const cb of this.listeners) cb();
  }

  private buildSnapshot(): Snapshot {
    const active = this.tabs.find((t) => t.id === this.activeTabId) ?? null;
    return {
      tabs: this.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favicon: t.favicon,
        loading: t.loading,
        active: t.id === this.activeTabId,
        pinned: t.pinned,
        groupId: t.groupId,
        suspended: t.suspended,
      })),
      activeId: this.activeTabId,
      activeUrl: active?.url ?? "",
      showNewTab: !active || !active.url || !this.ctrlReady,
      canBack: !!active && (active.navCount >= 1 || active.inPageNavCount >= 1),
      canFwd: !!active && !!active.homeBackUrl,
      status: this.status,
      statusWarn: this.statusWarn,
      progress: this.progress,
      settings: this.settings,
      history: this.history,
      shortcuts: this.shortcuts,
      toolbar: this.toolbar,
      customThemes: this.customThemes,
      tabGroups: this.tabGroups,
      savedTabGroups: this.savedTabGroups,
      ctrlReady: this.ctrlReady,
      capabilitiesReady: this.capabilitiesReady,
      engineSupport: this.engineSupport,
      deploymentMode: this.deploymentMode,
      abLaunched: !!window.__bardoAbLaunched,
      abBlocked: !!window.__bardoAbBlocked,
      wispUrl: this.wispUrl,
    };
  }

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
      if (!["scramjet", "klystron", "sherpa"].includes(settings.engine)) {
        settings.engine = DEFAULT_SETTINGS.engine;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      if (
        typeof settings.theme !== "string" ||
        (!settings.theme.startsWith("custom:") && !THEMES.some((t) => t.id === settings.theme))
      ) {
        settings.theme = DEFAULT_SETTINGS.theme;
      }
      settings.bookmarks = this.sanitizeBookmarks(settings.bookmarks);
      return settings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  private saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        toast.error("storage full. settings didn't save.");
      }
    }
  }
  getSettings() {
    return this.settings;
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (
      key === "engine" &&
      this.capabilitiesReady &&
      !this.engineSupport[value as EngineName]
    ) {
      toast.info("that engine isn't on this host.");
      return;
    }
    this.settings = { ...this.settings, [key]: value };
    if (key === "sessionOnly" && value === true) {
      this.clearSession();
      this.history = [];
      this.saveHistory();
    }
    this.saveSettings();

    if (key === "engine") {
      logEvent(`Switched proxy engine to ${ENGINE_BY_ID[value as EngineName]?.name ?? value}`);
      recordEngineRestart();
      this.initEngine();
    } else if (key === "restoreTabs") {
      if (value) this.saveSession();
      else this.clearSession();
    }
    this.emit();
  }

  patchSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    this.saveSettings();
    this.emit();
  }

  resetSettings() {
    const prevEngine = this.settings.engine;
    const bookmarks = this.settings.bookmarks;
    this.settings = { ...DEFAULT_SETTINGS, bookmarks };
    this.saveSettings();
    logEvent("Settings restored to defaults");
    if (this.settings.engine !== prevEngine) this.initEngine();
    if (!this.settings.restoreTabs) this.clearSession();
    this.emit();
  }

  private sanitizeBookmarks(raw: unknown): Bookmark[] {
    if (!Array.isArray(raw)) return [];
    const clean: Bookmark[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const title = typeof item.title === "string" ? item.title.trim().slice(0, 100) : "";
      const url = typeof item.url === "string" ? item.url.trim() : "";
      try {
        const parsed = new URL(url);
        if (!/^https?:$/.test(parsed.protocol) || seen.has(parsed.href)) continue;
        seen.add(parsed.href);
        clean.push({
          id: typeof item.id === "number" && Number.isFinite(item.id) ? item.id : Date.now() + clean.length,
          title: title || parsed.hostname,
          url: parsed.href,
          folder: typeof item.folder === "string" ? item.folder.trim().slice(0, 40) || undefined : undefined,
          pinnedNewTab: item.pinnedNewTab === true,
        });
      } catch {
      }
      if (clean.length >= 500) break;
    }
    return clean;
  }

  private commitToolbar(entries: ToolbarEntry[]) {
    const ids = sanitizeToolbarIds(entries.map((e) => e.id));
    if (!ids) return;
    this.toolbar = entries;
    if (!saveToolbar(ids)) toast.error("storage full. toolbar didn't save.");
    this.emit();
  }

  setToolbar(entries: ToolbarEntry[]) {
    this.commitToolbar([...entries]);
  }

  addToolbarItem(id: ToolbarItemId, index?: number) {
    const next = [...this.toolbar];
    next.splice(index ?? next.length, 0, makeEntry(id));
    this.commitToolbar(next);
  }

  removeToolbarItem(key: string) {
    if (this.toolbar.length <= 1) return;
    this.commitToolbar(this.toolbar.filter((e) => e.key !== key));
  }

  moveToolbarItem(key: string, to: number) {
    const from = this.toolbar.findIndex((e) => e.key === key);
    if (from === -1 || to < 0 || to >= this.toolbar.length || from === to) return;
    const next = [...this.toolbar];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.commitToolbar(next);
  }

  resetToolbar() {
    this.commitToolbar(toEntries([...DEFAULT_TOOLBAR]));
  }

  upsertCustomTheme(theme: CustomTheme): boolean {
    const clean = sanitizeCustomTheme(theme);
    if (!clean) return false;
    const index = this.customThemes.findIndex((t) => t.id === clean.id);
    if (index === -1 && this.customThemes.length >= MAX_CUSTOM_THEMES) {
      toast.error(`You can keep up to ${MAX_CUSTOM_THEMES} custom themes.`);
      return false;
    }
    const next = [...this.customThemes];
    if (index === -1) next.push(clean);
    else next[index] = clean;
    this.customThemes = next;
    if (!saveCustomThemes(next)) toast.error("storage full. theme didn't save.");
    this.emit();
    return true;
  }

  deleteCustomTheme(id: string) {
    this.customThemes = this.customThemes.filter((t) => t.id !== id);
    saveCustomThemes(this.customThemes);
    if (this.settings.theme === id) this.setSetting("theme", "dark");
    else this.emit();
  }

  mount(host: HTMLElement) {
    this.host = host;
    for (const t of this.tabs) host.appendChild(t.iframe);
  }

  boot() {
    if (this.booted) return;
    this.booted = true;
    this.restoreSession();
    void this.detectDeploymentCapabilities();
    this.loadShortcuts();
  }

  private async detectDeploymentCapabilities() {
    const support: Record<EngineName, boolean> = {
      sherpa: false,
      scramjet: false,
      klystron: false,
    };

    try {
      const response = await fetch("/api/capabilities", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
        throw new Error("Capabilities endpoint unavailable");
      }

      const payload = await response.json() as {
        app?: unknown;
        mode?: unknown;
        engines?: Partial<Record<EngineName, unknown>>;
      };
      if (payload.app !== "bardo" || !payload.engines) {
        throw new Error("Invalid capabilities response");
      }

      for (const engine of Object.keys(support) as EngineName[]) {
        support[engine] = payload.engines[engine] === true;
      }
      this.deploymentMode = payload.mode === "server" ? "server" : "frontend-preview";
    } catch {
      // Cloudflare intentionally hosts only the built frontend. Its SPA fallback
      // returns index.html for this URL, so a non-JSON response means preview mode.
      this.deploymentMode = "frontend-preview";
    }

    this.engineSupport = support;
    this.capabilitiesReady = true;

    if (!support[this.settings.engine]) {
      this.ctrlReady = false;
      this.wispUrl = null;
      window.__bardoCtrl = undefined;
      this.setStatus("preview only. browsing isn't on this host.", true);
      return;
    }

    this.emit();
    await this.initEngine();
  }

  private getActiveTab() {
    return this.tabs.find((t) => t.id === this.activeTabId) ?? null;
  }

  private createTabIframe(): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    iframe.className = "nav-frame";
    iframe.hidden = true;
    iframe.setAttribute(
      "sandbox",
      "allow-same-origin allow-scripts allow-forms allow-popups allow-modals " +
        "allow-pointer-lock allow-orientation-lock allow-presentation allow-downloads",
    );
    (this.host ?? document.body).appendChild(iframe);
    return iframe;
  }

  private bindTabLoad(tab: InternalTab) {
    tab.iframe.addEventListener("load", () => {
      this.installLinkInterceptor(tab);
      if (!tab.url) return;
      tab.loading = false;
      if (tab.id === this.activeTabId) this.finishProgress();
      this.refreshTabMeta(tab);
      this.addHistory(tab.url, tab.title);
      this.saveSession();
      this.emit();
    });
  }

  /**
   * Keeps links that would open a new browser tab inside Bardo instead. The
   * proxied page is served from our own origin, so its document is reachable
   * here: we watch clicks in the capture phase and, when an anchor would open a
   * new tab (target="_blank", or a middle / ctrl / cmd click), route it to a
   * Bardo tab rather than letting the sandboxed iframe spawn a real browser tab.
   *
   * Right-click "Open in new tab" never fires a click event, so it is left to
   * the browser on purpose — exactly the one case that should escape Bardo.
   */
  private installLinkInterceptor(tab: InternalTab) {
    let doc: Document | null = null;
    try {
      doc = tab.iframe.contentDocument;
    } catch {
      return; // cross-origin document — nothing we can (or should) touch
    }
    if (!doc || (doc as any).__bardoLinkHook) return;
    (doc as any).__bardoLinkHook = true;
    const handler = (e: MouseEvent) => this.handleFrameLinkClick(e);
    doc.addEventListener("click", handler, true);
    doc.addEventListener("auxclick", handler, true);
  }

  private handleFrameLinkClick(e: MouseEvent) {
    // Only primary (0) and middle (1) buttons open tabs; the right button is
    // handled by the native context menu and must be left alone.
    if (e.button !== 0 && e.button !== 1) return;
    if (e.defaultPrevented) return;
    const anchor = findAnchor(e);
    if (!anchor || !anchor.href) return;

    const opensNewTab =
      e.button === 1 || e.metaKey || e.ctrlKey || anchor.target === "_blank";
    if (!opensNewTab) return;

    const real = this.decodeProxiedUrl(anchor.href);
    if (!real) return; // not a proxied http(s) link — let the browser decide

    e.preventDefault();
    e.stopPropagation();
    // Modifier / middle clicks open in the background; a plain new-tab link
    // (target="_blank") comes to the foreground, matching browser conventions.
    if (e.button === 1 || e.metaKey || e.ctrlKey) this.openBackgroundTab(real);
    else this.openTab(real);
  }

  /**
   * Recovers the real destination from a proxied anchor href so it can be
   * handed back to {@link navigate}. Returns null when the link isn't a proxied
   * http(s) URL, in which case the click is left to its default behaviour.
   */
  private decodeProxiedUrl(href: string): string | null {
    if (!href) return null;
    if (!href.startsWith(location.origin)) {
      // Anchor wasn't rewritten to our origin (rare) — only take real web URLs.
      return /^https?:\/\//i.test(href) ? href : null;
    }
    const ctrl = window.__bardoCtrl;
    if (ctrl && "decodeUrl" in ctrl && typeof (ctrl as any).decodeUrl === "function") {
      try {
        const real = (ctrl as any).decodeUrl(href);
        if (typeof real === "string" && /^https?:\/\//i.test(real)) return real;
      } catch {
      }
    }
    const prefix = location.origin + this.activeSvcPrefix();
    if (href.startsWith(prefix) || href.startsWith(this.activeSvcPrefix())) {
      const real = decodeProxyPath(this.activeSvcPrefix(), href);
      if (real) return real;
      try {
        const sliced = href.startsWith(prefix) ? href.slice(prefix.length) : href.slice(this.activeSvcPrefix().length);
        const fallback = decodeDest(sliced);
        if (/^https?:\/\//i.test(fallback)) return fallback;
      } catch {
      }
    }
    return null;
  }

  openTab(url: string | null = null) {
    const id = this.nextTabId++;
    const iframe = this.createTabIframe();
    const tab: InternalTab = {
      id,
      title: "New Tab",
      url: "",
      favicon: null,
      loading: false,
      iframe,
      frame: null,
      navCount: 0,
      inPageNavCount: 0,
      homeBackUrl: null,
      suspended: false,
      pinned: false,
      groupId: null,
    };
    this.tabs.push(tab);
    this.bindTabLoad(tab);
    this.activateTab(id);
    if (url) this.navigate(url);
    this.emit();
    return id;
  }

  /**
   * Opens a URL in a new background tab without switching to it. The tab loads
   * lazily when first activated, mirroring how a modifier/middle-click new tab
   * behaves in a normal browser.
   */
  private openBackgroundTab(url: string) {
    const tab = this.openSuspendedTab({ url });
    this.applyUrlMeta(tab, url);
    this.saveSession();
    this.emit();
    return tab.id;
  }

  private openSuspendedTab(meta: { url: string; title?: string; favicon?: string | null; pinned?: boolean; groupId?: string | null }) {
    const id = this.nextTabId++;
    const iframe = this.createTabIframe();
    const tab: InternalTab = {
      id,
      title: meta.title || "New Tab",
      url: meta.url,
      favicon: meta.favicon || null,
      loading: false,
      iframe,
      frame: null,
      navCount: 0,
      inPageNavCount: 0,
      homeBackUrl: null,
      suspended: true,
      pinned: meta.pinned ?? false,
      groupId: meta.groupId ?? null,
    };
    this.tabs.push(tab);
    this.bindTabLoad(tab);
    return tab;
  }

  closeTab(id: number) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    this.tabs[idx].iframe.remove();
    this.tabs.splice(idx, 1);
    this.pruneEmptyTabGroups();
    if (this.tabs.length === 0) {
      this.clearSession();
      this.openTab();
      return;
    }
    if (this.activeTabId === id) {
      const next = this.tabs.find((t, i) => i >= idx && !t.pinned) ?? this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activateTab(next.id);
    }
    this.saveSession();
    this.emit();
  }

  pinTab(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab || tab.pinned) return;
    tab.pinned = true;
    this.tabs.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    this.saveSession();
    this.emit();
  }

  unpinTab(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab || !tab.pinned) return;
    tab.pinned = false;
    this.saveSession();
    this.emit();
  }

  togglePinTab(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.pinned) this.unpinTab(id);
    else this.pinTab(id);
  }

  activateTab(id: number) {
    for (const t of this.tabs) t.iframe.hidden = true;
    this.activeTabId = id;
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) {
      this.emit();
      return;
    }
    if (tab.suspended) {
      tab.suspended = false;
      this.navigate(tab.url);
      this.saveSession();
      return;
    }
    if (tab.url) {
      tab.iframe.hidden = false;
    }
    if (tab.loading) this.startProgress();
    else this.finishProgress();
    this.emit();
  }

  reorderTab(srcId: number, dstId: number) {
    if (srcId === dstId) return;
    const srcIdx = this.tabs.findIndex((t) => t.id === srcId);
    const dstIdx = this.tabs.findIndex((t) => t.id === dstId);
    if (srcIdx === -1 || dstIdx === -1) return;
    const srcTab = this.tabs[srcIdx];
    const dstTab = this.tabs[dstIdx];
    if (srcTab.pinned !== dstTab.pinned) return;
    if (srcTab.groupId !== dstTab.groupId) {
      if (dstTab.groupId) {
        this.addTabToGroup(srcId, dstTab.groupId);
        return;
      }
      srcTab.groupId = null;
      this.pruneEmptyTabGroups();
    }
    const [moved] = this.tabs.splice(srcIdx, 1);
    this.tabs.splice(dstIdx, 0, moved);
    this.saveSession();
    this.emit();
  }

  createTabGroup(tabId: number, name: string, color = "#7c6cff") {
    const tab = this.tabs.find((t) => t.id === tabId);
    const cleanName = name.trim().slice(0, 40);
    if (!tab || !cleanName) return false;
    const id = `group:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.tabGroups = [...this.tabGroups, { id, name: cleanName, collapsed: false, color }];
    tab.groupId = id;
    this.pruneEmptyTabGroups();
    this.saveSession();
    this.emit();
    return true;
  }

  addTabToGroup(tabId: number, groupId: string | null) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab || (groupId && !this.tabGroups.some((g) => g.id === groupId))) return;
    const previousGroupId = tab.groupId;
    tab.groupId = groupId;
    if (groupId) {
      const from = this.tabs.indexOf(tab);
      const lastGroupIndex = this.tabs.reduce((last, candidate, index) => candidate !== tab && candidate.groupId === groupId ? index : last, -1);
      if (lastGroupIndex >= 0 && from !== lastGroupIndex + 1) {
        this.tabs.splice(from, 1);
        const insertionIndex = from < lastGroupIndex ? lastGroupIndex : lastGroupIndex + 1;
        this.tabs.splice(insertionIndex, 0, tab);
      }
    } else if (previousGroupId) {
      // Keep a group contiguous when a tab is removed from its middle. Without
      // this, the ungrouped tab visually splits the group while only the first
      // run receives a header, which also makes collapse and drag targets feel
      // broken.
      const from = this.tabs.indexOf(tab);
      const lastPreviousGroupIndex = this.tabs.reduce(
        (last, candidate, index) => candidate !== tab && candidate.groupId === previousGroupId ? index : last,
        -1,
      );
      if (lastPreviousGroupIndex >= 0 && from < lastPreviousGroupIndex) {
        this.tabs.splice(from, 1);
        this.tabs.splice(lastPreviousGroupIndex, 0, tab);
      }
    }
    this.pruneEmptyTabGroups();
    this.saveSession();
    this.emit();
    return previousGroupId !== groupId;
  }

  renameTabGroup(groupId: string, name: string) {
    const cleanName = name.trim().slice(0, 40);
    if (!cleanName) return false;
    this.tabGroups = this.tabGroups.map((g) => (g.id === groupId ? { ...g, name: cleanName } : g));
    this.saveSession();
    this.emit();
    return true;
  }

  setTabGroupColor(groupId: string, color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color) || !this.tabGroups.some((group) => group.id === groupId)) return false;
    this.tabGroups = this.tabGroups.map((group) => group.id === groupId ? { ...group, color } : group);
    this.saveSession();
    this.emit();
    return true;
  }

  ungroupTabGroup(groupId: string) {
    if (!this.tabGroups.some((group) => group.id === groupId)) return false;
    for (const tab of this.tabs) if (tab.groupId === groupId) tab.groupId = null;
    this.tabGroups = this.tabGroups.filter((group) => group.id !== groupId);
    this.saveSession();
    this.emit();
    return true;
  }

  closeTabGroup(groupId: string) {
    const ids = this.tabs.filter((tab) => tab.groupId === groupId).map((tab) => tab.id);
    if (ids.length === 0) return 0;
    for (const id of ids) this.closeTab(id);
    return ids.length;
  }

  toggleTabGroup(groupId: string) {
    const group = this.tabGroups.find((g) => g.id === groupId);
    if (!group) return;
    const collapsed = !group.collapsed;
    this.tabGroups = this.tabGroups.map((candidate) => candidate.id === groupId ? { ...candidate, collapsed } : candidate);
    if (collapsed && this.tabs.some((t) => t.id === this.activeTabId && t.groupId === groupId)) {
      const next = this.tabs.find((t) => t.groupId !== groupId);
      if (next) this.activateTab(next.id);
      else this.openTab();
    }
    this.saveSession();
    this.emit();
  }

  saveTabGroup(groupId: string) {
    const group = this.tabGroups.find((g) => g.id === groupId);
    const tabs = this.tabs.filter((t) => t.groupId === groupId && t.url);
    if (!group || tabs.length === 0) return false;
    const saved: SavedTabGroup = {
      id: `saved:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: group.name,
      tabs: tabs.map((t) => ({ title: t.title, url: t.url, favicon: t.favicon })),
      savedAt: Date.now(),
      color: group.color,
    };
    const existing = this.savedTabGroups.find((candidate) => candidate.name.toLocaleLowerCase() === group.name.toLocaleLowerCase());
    if (existing) saved.id = existing.id;
    this.savedTabGroups = [saved, ...this.savedTabGroups.filter((candidate) => candidate.id !== saved.id)].slice(0, 20);
    this.saveSavedTabGroups();
    this.emit();
    return true;
  }

  reopenSavedTabGroup(savedId: string) {
    const saved = this.savedTabGroups.find((g) => g.id === savedId);
    if (!saved || saved.tabs.length === 0) return false;
    const groupId = `group:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.tabGroups = [...this.tabGroups, { id: groupId, name: saved.name, collapsed: false, color: saved.color }];
    const opened = saved.tabs.map((meta) => this.openSuspendedTab({ ...meta, groupId }));
    this.activateTab(opened[0].id);
    this.saveSession();
    this.emit();
    return true;
  }

  deleteSavedTabGroup(savedId: string) {
    this.savedTabGroups = this.savedTabGroups.filter((g) => g.id !== savedId);
    this.saveSavedTabGroups();
    this.emit();
  }

  private pruneEmptyTabGroups() {
    const valid = new Set(this.tabGroups.filter((g) => this.tabs.some((t) => t.groupId === g.id)).map((g) => g.id));
    this.tabGroups = this.tabGroups.filter((g) => valid.has(g.id));
    for (const tab of this.tabs) if (tab.groupId && !valid.has(tab.groupId)) tab.groupId = null;
  }

  private loadSavedTabGroups(): SavedTabGroup[] {
    try {
      const raw = JSON.parse(localStorage.getItem(TAB_GROUPS_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((g: any) => g && typeof g.id === "string" && typeof g.name === "string" && Array.isArray(g.tabs))
        .slice(0, 20)
        .map((g: any) => ({
          id: g.id.slice(0, 64),
          name: g.name.trim().slice(0, 40) || "Tab group",
          savedAt: typeof g.savedAt === "number" ? g.savedAt : Date.now(),
          color: typeof g.color === "string" && /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : "#7c6cff",
          tabs: g.tabs
            .filter((t: any) => t && typeof t.url === "string" && /^https?:\/\//i.test(t.url))
            .slice(0, 30)
            .map((t: any) => ({ title: String(t.title || "New Tab").slice(0, 100), url: t.url, favicon: typeof t.favicon === "string" ? t.favicon : null })),
        }))
        .filter((g: SavedTabGroup) => g.tabs.length > 0);
    } catch {
      return [];
    }
  }

  private saveSavedTabGroups() {
    try {
      localStorage.setItem(TAB_GROUPS_KEY, JSON.stringify(this.savedTabGroups));
    } catch {
      toast.error("storage full. tab group didn't save.");
    }
  }

  private saveSession() {
    if (this.restoring || !this.settings.restoreTabs || this.settings.sessionOnly) return;
    try {
      const open: { url: string; title: string; favicon: string | null; pinned: boolean; groupId: string | null }[] = [];
      let active = -1;
      for (const t of this.tabs) {
        if (!t.url) continue;
        if (t.id === this.activeTabId) active = open.length;
        open.push({ url: t.url, title: t.title, favicon: t.favicon, pinned: t.pinned, groupId: t.groupId });
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: open, active, groups: this.tabGroups }));
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        toast.error("storage full. session didn't save.");
      }
    }
  }
  private clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
    }
  }
  private restoreSession() {
    let data: any = null;
    if (this.settings.restoreTabs && !this.settings.sessionOnly) {
      try {
        data = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      } catch {
      }
    }
    const saved =
      data && Array.isArray(data.tabs) ? data.tabs.filter((t: any) => t && t.url) : [];
    if (!saved.length) {
      this.openTab();
      return;
    }
    this.restoring = true;
    this.tabGroups = Array.isArray(data.groups)
      ? data.groups
          .filter((g: any) => g && typeof g.id === "string" && typeof g.name === "string")
          .slice(0, 20)
          .map((g: any) => ({ id: g.id.slice(0, 64), name: g.name.trim().slice(0, 40) || "Tab group", collapsed: !!g.collapsed, color: typeof g.color === "string" && /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : "#7c6cff" }))
      : [];
    saved.forEach((m: any) => this.openSuspendedTab(m));
    this.pruneEmptyTabGroups();
    const idx =
      typeof data.active === "number" && data.active >= 0 && data.active < this.tabs.length
        ? data.active
        : 0;
    this.restoring = false;
    this.activateTab(this.tabs[idx].id);
    logEvent(`Restored ${saved.length} tab${saved.length === 1 ? "" : "s"} from your last session`);
    this.saveSession();
  }

  private applyUrlMeta(tab: InternalTab, url: string) {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
    }
    tab.title = pageLabel(url);
    tab.favicon = host ? gFav(host) : null;
  }

  private refreshTabMeta(tab: InternalTab) {
    // Keep hostname-only titles in the parent chrome. iframe document.title
    // often echoes the search query ("unblocked games - Startpage") which
    // would leak into tab labels, aria, and history rows.
    if (tab.url) this.applyUrlMeta(tab, tab.url);
  }

  private startProgress() {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progress = "active";
    this.emit();
  }
  private finishProgress() {
    if (this.progress !== "active") return;
    this.progress = "done";
    this.emit();
    this.progressTimer = setTimeout(() => {
      this.progress = "idle";
      this.emit();
    }, 320);
  }

  toUrl(s: string) {
    s = s.trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (!s.includes(" ") && /^[a-z0-9-]+(\.[a-z]{2,})(\/.*)?$/i.test(s)) return "https://" + s;
    const engine = SEARCH_ENGINES[this.settings.searchEngine] || SEARCH_ENGINES.duckduckgo;
    return engine(s);
  }

  private activeSvcPrefix() {
    if (this.settings.engine === "sherpa") return SVC_PREFIX_SHERPA;
    if (this.settings.engine === "klystron") return SVC_PREFIX_KLYSTRON;
    return SVC_PREFIX;
  }

  proxiedUrl(rawUrl: string) {
    const ctrl = window.__bardoCtrl;
    if (ctrl && "encodeUrl" in ctrl && typeof ctrl.encodeUrl === "function") {
      return new URL(ctrl.encodeUrl(rawUrl), location.origin).href;
    }
    return location.origin + encodeProxyPath(this.activeSvcPrefix(), rawUrl);
  }

  navigate(url: string) {
    const ctrl = window.__bardoCtrl;
    if (!ctrl) {
      this.pendingUrl = url;
      this.setStatus("Loading, will navigate when ready…");
      const tab = this.getActiveTab();
      if (tab) {
        tab.url = url;
        tab.iframe.hidden = true;
      }
      this.emit();
      return;
    }
    const tab = this.getActiveTab();
    if (!tab) return;

    if (!tab.frame) {
      tab.frame = ctrl.createFrame(tab.iframe);
      tab.frame.addEventListener("urlchange", (e: any) => {
        if (!e.url) return;
        tab.inPageNavCount++;
        tab.homeBackUrl = null;
        tab.url = e.url;
        this.applyUrlMeta(tab, e.url);
        this.addHistory(e.url, tab.title);
        this.saveSession();
        this.emit();
      });
    }

    tab.url = url;
    tab.navCount++;
    tab.inPageNavCount = 0;
    tab.homeBackUrl = null;
    tab.loading = true;
    if (tab.id === this.activeTabId) this.startProgress();
    tab.frame.go(url);
    this.applyUrlMeta(tab, url);
    this.addHistory(url, tab.title);
    tab.iframe.hidden = false;
    this.saveSession();
    this.emit();
  }

  back() {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (tab.inPageNavCount > 0) {
      tab.inPageNavCount--;
      tab.frame?.back();
      tab.iframe.contentWindow?.history?.back();
    } else if (tab.navCount > 0) {
      tab.homeBackUrl = tab.url;
      tab.url = "";
      tab.title = "New Tab";
      tab.navCount = 0;
      tab.inPageNavCount = 0;
      tab.iframe.hidden = true;
      this.saveSession();
    }
    this.emit();
  }

  forward() {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (tab.homeBackUrl) {
      this.navigate(tab.homeBackUrl);
    } else {
      tab.frame?.forward();
      tab.iframe.contentWindow?.history?.forward();
    }
  }

  reload() {
    const tab = this.getActiveTab();
    if (tab) this.reloadTab(tab.id);
  }

  reloadTab(id: number) {
    const tab = this.tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    if (!tab.url) {
      if (tab.id === this.activeTabId) this.initEngine();
      return;
    }
    if (tab.suspended) {
      this.activateTab(tab.id);
      return;
    }
    tab.loading = true;
    if (tab.id === this.activeTabId) this.startProgress();
    tab.frame?.reload();
    this.emit();
  }

  goHome() {
    const tab = this.getActiveTab();
    if (!tab) return;
    tab.url = "";
    tab.title = "New Tab";
    tab.navCount = 0;
    tab.iframe.hidden = true;
    this.saveSession();
    this.emit();
  }

  submitUrl(raw: string) {
    const v = raw.trim();
    if (v) this.navigate(this.toUrl(v));
  }

  openExternal() {
    const url = this.getActiveTab()?.url;
    if (!url) return;
    window.open(this.proxiedUrl(url), "_blank", "noopener,noreferrer");
  }

  createBookmark(input: { title: string; url: string; folder?: string; pinnedNewTab?: boolean }): { status: "added" | "duplicate" | "invalid"; title?: string; id?: number } {
    let url = "";
    try {
      const parsed = new URL(input.url.trim());
      if (!/^https?:$/.test(parsed.protocol)) return { status: "invalid" };
      url = parsed.href;
    } catch {
      return { status: "invalid" };
    }
    if (this.settings.bookmarks.some((bookmark) => bookmark.url === url)) return { status: "duplicate" };
    const id = Date.now();
    const title = input.title.trim().slice(0, 100) || new URL(url).hostname;
    const folder = input.folder?.trim().slice(0, 40) || undefined;
    this.patchSettings({ bookmarks: [...this.settings.bookmarks, { id, title, url, folder, pinnedNewTab: input.pinnedNewTab === true }] });
    return { status: "added", title, id };
  }

  addBookmark(): { status: "added" | "duplicate" | "empty"; title?: string; id?: number } {
    const tab = this.getActiveTab();
    if (!tab?.url) return { status: "empty" };
    let title = tab.title;
    if (!title) {
      try {
        title = new URL(tab.url).hostname;
      } catch {
        title = tab.url;
      }
    }
    const result = this.createBookmark({ title, url: tab.url });
    if (result.status === "invalid") return { status: "empty" };
    if (result.status === "duplicate") return { status: "duplicate" };
    return { status: "added", title: result.title, id: result.id };
  }
  removeBookmark(id: number) {
    this.patchSettings({ bookmarks: this.settings.bookmarks.filter((b) => b.id !== id) });
  }
  updateBookmark(id: number, patch: Partial<Pick<Bookmark, "title" | "url" | "folder" | "pinnedNewTab">>) {
    const bookmarks = this.settings.bookmarks.map((bookmark) => {
      if (bookmark.id !== id) return bookmark;
      const title = patch.title !== undefined ? patch.title.trim().slice(0, 100) || bookmark.title : bookmark.title;
      const folder = patch.folder !== undefined ? patch.folder.trim().slice(0, 40) || undefined : bookmark.folder;
      let url = bookmark.url;
      if (patch.url !== undefined) {
        try {
          const parsed = new URL(patch.url.trim());
          if (/^https?:$/.test(parsed.protocol)) url = parsed.href;
        } catch {
        }
      }
      return { ...bookmark, ...patch, title, url, folder };
    });
    this.patchSettings({ bookmarks });
  }

  renameBookmarkFolder(folder: string, name: string) {
    const cleanName = name.trim().slice(0, 40);
    if (!cleanName || cleanName === folder) return false;
    this.patchSettings({ bookmarks: this.settings.bookmarks.map((bookmark) => bookmark.folder === folder ? { ...bookmark, folder: cleanName } : bookmark) });
    return true;
  }

  removeBookmarkFolder(folder: string) {
    this.patchSettings({ bookmarks: this.settings.bookmarks.map((bookmark) => bookmark.folder === folder ? { ...bookmark, folder: undefined } : bookmark) });
  }
  moveBookmark(id: number, delta: -1 | 1) {
    const bookmarks = [...this.settings.bookmarks];
    const from = bookmarks.findIndex((b) => b.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= bookmarks.length) return;
    const [moved] = bookmarks.splice(from, 1);
    bookmarks.splice(to, 0, moved);
    this.patchSettings({ bookmarks });
  }
  moveBookmarkTo(id: number, index: number) {
    const bookmarks = [...this.settings.bookmarks];
    const from = bookmarks.findIndex((b) => b.id === id);
    if (from < 0) return;
    const to = Math.max(0, Math.min(index, bookmarks.length - 1));
    if (from === to) return;
    const [moved] = bookmarks.splice(from, 1);
    bookmarks.splice(to, 0, moved);
    this.patchSettings({ bookmarks });
  }
  importBookmarks(raw: unknown): number {
    const source = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as any).bookmarks) ? (raw as any).bookmarks : null;
    if (!source) throw new Error("This file doesn't contain a bookmarks list.");
    const imported = this.sanitizeBookmarks(source);
    if (imported.length === 0 && source.length > 0) throw new Error("No valid http or https bookmarks were found.");
    const current = this.settings.bookmarks;
    const urls = new Set(current.map((b) => b.url));
    const additions = imported.filter((b) => !urls.has(b.url)).map((b, index) => ({ ...b, id: Date.now() + index }));
    this.patchSettings({ bookmarks: [...current, ...additions].slice(0, 500) });
    return additions.length;
  }
  openBookmarkFolder(folder: string) {
    const bookmarks = this.settings.bookmarks.filter((b) => (b.folder || "") === folder);
    if (bookmarks.length === 0) return 0;
    bookmarks.forEach((bookmark) => this.openTab(bookmark.url));
    return bookmarks.length;
  }
  openBookmarkFolderAsGroup(folder: string) {
    const bookmarks = this.settings.bookmarks.filter((bookmark) => (bookmark.folder || "") === folder);
    if (bookmarks.length === 0) return 0;
    const groupId = `group:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.tabGroups = [...this.tabGroups, { id: groupId, name: folder, collapsed: false, color: "#7c6cff" }];
    const opened = bookmarks.map((bookmark) => this.openSuspendedTab({ title: bookmark.title, url: bookmark.url, groupId }));
    this.activateTab(opened[0].id);
    this.saveSession();
    this.emit();
    return opened.length;
  }
  restoreBookmark(bookmark: Bookmark, index: number) {
    if (this.settings.bookmarks.some((b) => b.id === bookmark.id)) return;
    const next = [...this.settings.bookmarks];
    next.splice(Math.min(index, next.length), 0, bookmark);
    this.patchSettings({ bookmarks: next });
  }

  launchAboutBlank(mode: "session" | "current") {
    const active = this.getActiveTab();
    if (mode === "current" && !active?.url) {
      toast.error("Open a page before launching the current URL.");
      return false;
    }
    const cloak = this.settings.aboutBlankRememberCloak ? TAB_CLOAKS[this.settings.tabCloak] : null;
    const title = this.settings.aboutBlankTitle.trim() || cloak?.title || "";
    const favicon = this.settings.aboutBlankFavicon.trim() || cloak?.favicon || "";
    if (favicon && !/^https?:\/\//i.test(favicon) && !/^data:image\//i.test(favicon)) {
      toast.error("Use an http(s) URL or image data URL for the launcher favicon.");
      return false;
    }
    const src = mode === "current" ? this.proxiedUrl(active!.url) : location.href;
    const opened = window.__bardoLaunchAboutBlank?.(src, { title, favicon }) ?? false;
    window.__bardoAbBlocked = !opened;
    if (opened) toast.success(mode === "current" ? "Current page launched in about:blank" : "Bardo session launched in about:blank");
    else toast.error("Popup blocked. Allow popups for Bardo, then try again.");
    this.emit();
    return opened;
  }

  private checkWisp(url: string, timeoutMs = 8000) {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const ws = new WebSocket(url);
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        try {
          ws.close();
        } catch {
        }
        resolve(ok);
      };
      const t = setTimeout(() => done(false), timeoutMs);
      ws.addEventListener("open", () => done(true));
      ws.addEventListener("error", () => done(false));
    });
  }

  private firstReachable(urls: string[], timeoutMs = 6000) {
    return new Promise<string | null>((resolve) => {
      let remaining = urls.length;
      if (remaining === 0) {
        resolve(null);
        return;
      }
      let settled = false;
      urls.forEach((url) => {
        this.checkWisp(url, timeoutMs).then((ok) => {
          if (settled) return;
          if (ok) {
            settled = true;
            resolve(url);
            return;
          }
          if (--remaining === 0) resolve(null);
        });
      });
    });
  }

  private async setupTransport() {
    this.setStatus("Setting up transport…");
    if (!this.conn) this.conn = new window.BareMux.BareMuxConnection("/baremux/worker.js");
    const wsProto = location.protocol === "https:" ? "wss" : "ws";
    const localWisp = `${wsProto}://${location.host}/wisp/`;
    const localReady = await this.checkWisp(localWisp, 1500);
    const wispUrl = localReady
      ? localWisp
      : await this.firstReachable(PUBLIC_WISP_SERVERS);
    if (!wispUrl) throw new Error("No Wisp server reachable — check your connection.");
    await this.conn.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
    this.wispUrl = wispUrl;
    return wispUrl;
  }

  private async registerSW(swPath: string, scope: string) {
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      if (!reg.scope.endsWith(scope)) await reg.unregister();
    }
    const reg = await navigator.serviceWorker.register(swPath, {
      scope,
      updateViaCache: "none",
    });
    await new Promise<void>((resolve, reject) => {
      if (reg.active) {
        resolve();
        return;
      }
      const sw = reg.installing || reg.waiting;
      if (!sw) {
        reject(new Error("No service worker found"));
        return;
      }
      sw.addEventListener("statechange", function (this: ServiceWorker) {
        if (this.state === "activated") resolve();
        if (this.state === "redundant") reject(new Error("Service worker install failed"));
      });
    });
    return reg;
  }

  private scheduleSWUpdate(reg: ServiceWorkerRegistration) {
    this.activeSWReg = reg;
    if (this.swUpdateScheduled) return;
    this.swUpdateScheduled = true;
    setInterval(() => {
      if (this.activeSWReg) this.activeSWReg.update().catch(() => {});
    }, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.activeSWReg) {
        if (this.swUpdateDebounce) clearTimeout(this.swUpdateDebounce);
        this.swUpdateDebounce = setTimeout(() => {
          this.activeSWReg?.update().catch(() => {});
        }, 5000);
      }
    });
  }

  async initEngine(attempt = 1) {
    if (this.capabilitiesReady && !this.engineSupport[this.settings.engine]) {
      this.ctrlReady = false;
      this.setStatus("this engine isn't on this host.", true);
      return;
    }
    if (!("serviceWorker" in navigator)) {
      this.setStatus("Service workers not supported.", true);
      return;
    }
    try {
      if (this.settings.engine === "klystron") await this.initKlystron();
      else if (this.settings.engine === "sherpa") await this.initSherpa();
      else await this.initScramjet();
    } catch (e: any) {
      console.error(`[bardo] init failed (attempt ${attempt}):`, e);
      if (attempt < 3) {
        const delay = attempt * 2000;
        this.setStatus(`Error, retrying in ${delay / 1000}s…`, true);
        logEvent(`Engine error — retrying (attempt ${attempt + 1} of 3)`, "warn");
        recordEngineRestart();
        setTimeout(() => this.initEngine(attempt + 1), delay);
      } else if (!sessionStorage.getItem("bardo-sw-fix-attempted")) {
        sessionStorage.setItem("bardo-sw-fix-attempted", "1");
        this.setStatus("Refreshing…");
        await this.forceReload();
      } else {
        sessionStorage.removeItem("bardo-sw-fix-attempted");
        this.setStatus(e.message, true);
        logEvent(`Engine failed to start: ${e.message}`, "error");
      }
    }
  }

  /** User-initiated restart of the currently selected engine (not a switch). */
  async restartEngine() {
    if (this.capabilitiesReady && !this.engineSupport[this.settings.engine]) {
      toast.info("browsing engines aren't on this host.");
      return;
    }
    const name = ENGINE_BY_ID[this.settings.engine]?.name ?? this.settings.engine;
    logEvent(`Restarting the ${name} engine…`);
    recordEngineRestart();
    this.ctrlReady = false;
    this.emit();
    await this.initEngine();
  }

  private async initScramjet() {
    this.setStatus("Starting engine…");
    const [, ctrl, reg] = await Promise.all([
      this.setupTransport(),
      this.startScramjetController(),
      this.registerSW("/sw.js", SVC_PREFIX),
    ]);
    this.scheduleSWUpdate(reg);
    window.__bardoCtrl = ctrl;
    this.ctrlReady = true;
    sessionStorage.removeItem("bardo-sw-fix-attempted");
    this.setStatus("");
    this.flushPending();
  }

  private async startScramjetController() {
    const { ScramjetController } = window.$scramjetLoadController();
    const ctrl = new ScramjetController({
      prefix: SVC_PREFIX,
      files: {
        wasm: "/scramjet/scramjet.wasm.wasm",
        all: "/scramjet/scramjet.all.js",
        sync: "/scramjet/scramjet.sync.js",
      },
      flags: { sourcemaps: false, captureErrors: false },
      codec: pathCodec,
    });
    try {
      await ctrl.init();
    } catch (e: any) {
      if (e.message?.includes("object store") || e.message?.includes("IDBDatabase")) {
        await new Promise<void>((resolve) => {
          const r = indexedDB.deleteDatabase("$scramjet");
          r.onsuccess = r.onerror = r.onblocked = () => resolve();
        });
        await ctrl.init();
      } else {
        throw e;
      }
    }
    return ctrl;
  }

  private async initSherpa() {
    this.setStatus("Starting engine…");
    const [, ctrl, reg] = await Promise.all([
      this.setupTransport(),
      this.startSherpaController(),
      this.registerSW("/sw-sherpa.js", SVC_PREFIX_SHERPA),
    ]);
    this.scheduleSWUpdate(reg);
    window.__bardoCtrl = ctrl;
    this.ctrlReady = true;
    sessionStorage.removeItem("bardo-sw-fix-attempted");
    this.setStatus("");
    this.flushPending();
  }

  private async startSherpaController() {
    const { SherpaController } = window.$sherpaLoadController();
    const ctrl = new SherpaController({
      prefix: SVC_PREFIX_SHERPA,
      files: {
        wasm: SHERPA_RUNTIME.wasm,
        all: SHERPA_RUNTIME.all,
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
      errorPage: {
        title: "This page didn't load",
        repoUrl: "",
        logo: "",
      },
      // Source maps retain original rewrite spans and inflate rewritten
      // scripts. Bardo's normal browsing path does not need that debug data.
      flags: { sourcemaps: false, captureErrors: false },
      codec: pathCodec,
    });
    try {
      await ctrl.init();
    } catch (e: any) {
      if (e.message?.includes("object store") || e.message?.includes("IDBDatabase")) {
        await new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase("$scramjet");
          request.onsuccess = request.onerror = request.onblocked = () => resolve();
        });
        await new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase("$sherpa");
          request.onsuccess = request.onerror = request.onblocked = () => resolve();
        });
        await ctrl.init();
      } else {
        throw e;
      }
    }
    return ctrl;
  }

  // Klystron is a server-side proxy: the Bardo server fetches and rewrites pages,
  // so the client needs no bare-mux/wisp transport or wasm controller — just the
  // companion service worker (scoped to /klystron/) to catch runtime requests.
  private async initKlystron() {
    this.wispUrl = null;
    this.setStatus("Starting Klystron…");
    const reg = await this.registerSW("/sw-klystron.js", SVC_PREFIX_KLYSTRON);
    this.scheduleSWUpdate(reg);
    window.__bardoCtrl = {
      _prefix: SVC_PREFIX_KLYSTRON,
      encodeUrl: (url: string) => encodeProxyPath(SVC_PREFIX_KLYSTRON, url),
      decodeUrl: (href: string) => decodeProxyPath(SVC_PREFIX_KLYSTRON, href) ?? href,
      createFrame: (iframe: HTMLIFrameElement) =>
        new PrefixFrame(iframe, SVC_PREFIX_KLYSTRON, (href) => decodeProxyPath(SVC_PREFIX_KLYSTRON, href)),
    };
    this.ctrlReady = true;
    sessionStorage.removeItem("bardo-sw-fix-attempted");
    this.setStatus("");
    this.flushPending();
  }

  private flushPending() {
    recordConnectionSuccess(ENGINE_BY_ID[this.settings.engine]?.name ?? this.settings.engine);
    if (this.pendingUrl) {
      const url = this.pendingUrl;
      this.pendingUrl = null;
      this.navigate(url);
    }
    this.emit();
  }

  async forceReload() {
    this.setStatus("Clearing cache…");
    logEvent("Clearing cache and restarting Bardo…", "warn");
    recordEngineRestart();
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      if (
        reg.scope.includes(SVC_PREFIX) ||
        reg.scope.includes("/sherpa/service/") ||
        reg.scope.includes(SVC_PREFIX_KLYSTRON) ||
        // Leftover from the removed OpulentAPI engine.
        reg.scope.includes("/opulent/")
      ) {
        await reg.unregister();
      }
    }
    for (const db of ["$scramjet", "$sherpa"]) {
      await new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase(db);
        r.onsuccess = r.onerror = r.onblocked = () => resolve();
      });
    }
    window.location.reload();
  }

  private setStatus(msg: string, warn = false) {
    this.status = msg;
    this.statusWarn = warn;
    this.emit();
  }

  private loadHistory(): HistoryEntry[] {
    if (this.settings.sessionOnly) return [];
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }
  private saveHistory() {
    try {
      if (this.settings.sessionOnly) localStorage.removeItem(HISTORY_KEY);
      else localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        toast.error("storage full. history didn't save.");
      }
    }
  }
  private addHistory(url: string, title: string) {
    if (!this.settings.historyEnabled || this.settings.sessionOnly) return;
    if (!url || !/^https?:/i.test(url)) return;
    if (this.history[0] && this.history[0].url === url) {
      this.history[0] = { ...this.history[0], ts: Date.now(), title: title || this.history[0].title };
      this.history = [...this.history];
      this.saveHistory();
      return;
    }
    this.history = [{ url, title: title || "", ts: Date.now() }, ...this.history];
    if (this.history.length > HISTORY_MAX) this.history.length = HISTORY_MAX;
    this.saveHistory();
  }
  removeHistory(entry: HistoryEntry) {
    this.history = this.history.filter((x) => x !== entry);
    this.saveHistory();
    this.emit();
  }
  clearHistory(): HistoryEntry[] {
    const prior = this.history;
    this.history = [];
    this.saveHistory();
    this.emit();
    return prior;
  }
  restoreHistory(entries: HistoryEntry[]) {
    if (this.settings.sessionOnly) return;
    this.history = entries;
    this.saveHistory();
    this.emit();
  }

  /** Keeps only the most recent `keep` history entries. Returns how many were removed. */
  trimHistory(keep: number): number {
    const removed = Math.max(0, this.history.length - keep);
    if (removed > 0) {
      this.history = this.history.slice(0, keep);
      this.saveHistory();
      logEvent(`Trimmed ${removed} old history ${removed === 1 ? "entry" : "entries"}`);
      this.emit();
    }
    return removed;
  }

  /** Forgets the saved tab session without touching history or other settings. */
  clearSavedSession() {
    this.clearSession();
    logEvent("Saved session cleared");
    this.emit();
  }

  clearBrowsingData() {
    this.history = [];
    try {
      for (const key of [HISTORY_KEY, SESSION_KEY, NOTES_KEY, TODOS_KEY]) localStorage.removeItem(key);
    } catch {
    }
    logEvent("Browsing data cleared");
    this.emit();
  }

  clearAllData() {
    try {
      const keys: string[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith("bardo-")) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem("bardo-ab");
      sessionStorage.removeItem("bardo-sw-fix-attempted");
    } catch {
    }
    window.setTimeout(() => window.location.reload(), 250);
  }

  private async loadShortcuts() {
    // User-customized shortcuts take precedence; the bundled JSON is only a seed.
    try {
      const raw = localStorage.getItem(SHORTCUTS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.shortcuts = data.filter((s: any) => s && s.url);
          this.emit();
          return;
        }
      }
    } catch (e) {
      console.error("[bardo] failed to read saved shortcuts:", e);
    }
    try {
      const resp = await fetch("/shortcuts.json");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      this.shortcuts = Array.isArray(data) ? data.filter((s: any) => s.url) : [];
      this.emit();
    } catch (e) {
      console.error("[bardo] failed to load shortcuts:", e);
    }
  }

  private saveShortcuts() {
    try {
      localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(this.shortcuts));
    } catch (e: any) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        toast.error("storage full. shortcut didn't save.");
      }
    }
  }

  private normalizeShortcut(sc: Shortcut): Shortcut | null {
    let url = (sc.url ?? "").trim();
    if (!url) return null;
    if (!/^[a-z]+:\/\//i.test(url)) url = "https://" + url;
    let label = (sc.label ?? "").trim();
    if (!label) {
      try {
        label = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        label = url;
      }
    }
    const icon = sc.icon?.trim() || undefined;
    return { label, url, icon };
  }

  addShortcut(sc: Shortcut) {
    const next = this.normalizeShortcut(sc);
    if (!next) return;
    this.shortcuts = [...this.shortcuts, next];
    this.saveShortcuts();
    this.emit();
  }

  updateShortcut(index: number, sc: Shortcut) {
    if (index < 0 || index >= this.shortcuts.length) return;
    const next = this.normalizeShortcut(sc);
    if (!next) return;
    this.shortcuts = this.shortcuts.map((s, i) => (i === index ? next : s));
    this.saveShortcuts();
    this.emit();
  }

  removeShortcut(index: number) {
    if (index < 0 || index >= this.shortcuts.length) return;
    this.shortcuts = this.shortcuts.filter((_, i) => i !== index);
    this.saveShortcuts();
    this.emit();
  }

  reorderShortcuts(from: number, to: number) {
    const n = this.shortcuts.length;
    if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
    const next = [...this.shortcuts];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.shortcuts = next;
    this.saveShortcuts();
    this.emit();
  }

  panic() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(NOTES_KEY);
      localStorage.removeItem(TODOS_KEY);
    } catch {
    }
    this.history = [];
    let target = "https://classroom.google.com";
    try {
      const candidate = new URL(this.settings.panicUrl);
      if (candidate.protocol === "http:" || candidate.protocol === "https:") target = candidate.href;
    } catch {}
    window.location.replace(target);
  }

  randomAccent() {
    return ACCENTS[Math.floor(Math.random() * ACCENTS.length)].value;
  }
}

// A frame driven purely by setting `iframe.src = prefix + encodeDest(url)`.
// Used by the server-side engines. An optional `decode` recovers
// the real remote URL from the proxied href so the address bar / history stay
// accurate (the payload after the prefix is XOR+base64url, not percent-encoding).
class PrefixFrame {
  private listeners: Record<string, ((e: any) => void)[]> = {};
  private iframe: HTMLIFrameElement;
  private prefix: string;
  private decode?: (href: string) => string | null;
  constructor(iframe: HTMLIFrameElement, prefix: string, decode?: (href: string) => string | null) {
    this.iframe = iframe;
    this.prefix = prefix;
    this.decode = decode;
    iframe.addEventListener("load", () => this.onLoad());
  }
  private onLoad() {
    try {
      const href = this.iframe.contentWindow?.location.href;
      if (href && href.startsWith(location.origin + this.prefix)) {
        const url = this.decode ? this.decode(href) : href;
        if (url) this.listeners.urlchange?.forEach((fn) => fn({ url }));
      }
    } catch {
    }
  }
  go(url: string) {
    this.iframe.src = encodeProxyPath(this.prefix, url);
  }
  reload() {
    this.iframe.contentWindow?.location.reload();
  }
  back() {
    this.iframe.contentWindow?.history.back();
  }
  forward() {
    this.iframe.contentWindow?.history.forward();
  }
  addEventListener(type: string, fn: (e: any) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
}

function gFav(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

// Finds the nearest anchor for a click inside a proxied frame. Uses tagName
// rather than `instanceof HTMLAnchorElement` because the element lives in the
// iframe's realm, where a cross-realm instanceof check would always be false.
function findAnchor(e: MouseEvent): HTMLAnchorElement | null {
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  for (const node of path) {
    if (node && (node as Element).nodeType === 1 && (node as Element).tagName === "A") {
      return node as HTMLAnchorElement;
    }
  }
  let el = e.target as Element | null;
  while (el && el.nodeType === 1) {
    if (el.tagName === "A") return el as HTMLAnchorElement;
    el = el.parentElement;
  }
  return null;
}

export const core = new BardoCore();

const prevController = navigator.serviceWorker?.controller ?? null;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (prevController) window.location.reload();
});
