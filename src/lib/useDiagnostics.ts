import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CUSTOM_THEMES_KEY,
  ENGINE_BY_ID,
  ENGINES,
  HISTORY_KEY,
  NOTES_KEY,
  SESSION_KEY,
  SETTINGS_KEY,
  SHORTCUTS_KEY,
  TODOS_KEY,
  TOOLBAR_KEY,
  WALLPAPER_KEY,
  WEATHER_KEY,
  appAsset,
  type EngineInfo,
} from "./constants";
import {
  getDiagLog,
  getEngineRestartInfo,
  getLastConnectedAt,
  subscribeDiagnostics,
  SESSION_START,
  type DiagLogEntry,
  type EngineRestartInfo,
} from "./diagnostics";
import { shallowEqual, useBardoSelector } from "./useCore";
import type { TabView } from "./types";

const POLL_MS = 5000;
const TICK_MS = 1000;
const PING_PATH = appAsset("/shortcuts.json");
const LATENCY_WARN_MS = 900;
const STORAGE_WARN_RATIO = 0.9;

export type HealthLevel = "ok" | "warn" | "critical";

export interface DiagIssue {
  level: HealthLevel;
  text: string;
}

export type SWState = "activated" | "installing" | "waiting" | "none" | "unsupported";

export interface ServiceWorkerInfo {
  supported: boolean;
  matched: boolean;
  state: SWState;
  scriptURL: string | null;
  controlling: boolean;
  updateAvailable: boolean;
}

export interface NetworkInfo {
  online: boolean;
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean;
  latencyMs: number | null;
  latencyFailed: boolean;
}

export interface StorageBreakdownItem {
  label: string;
  bytes: number;
}

export interface StorageInfo {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  breakdown: StorageBreakdownItem[];
}

export interface PerformanceInfo {
  startupMs: number | null;
  memoryUsedMb: number | null;
  memoryLimitMb: number | null;
  animationMode: "full" | "reduced" | "none";
}

export interface DiagnosticsData {
  engine: EngineInfo;
  ctrlReady: boolean;
  status: string;
  statusWarn: boolean;
  wispUrl: string | null;
  transport: "libcurl" | "epoxy" | null;
  tabs: TabView[];
  sleepingTabs: number;
  historyCount: number;
  bookmarksCount: number;
  historyEnabled: boolean;
  bookmarksVisible: boolean;
  widgetsActive: boolean;
  erudaEnabled: boolean;
  toolbarCount: number;
  restartInfo: EngineRestartInfo;
  lastConnectedAt: number | null;
  sessionDurationMs: number;
  log: DiagLogEntry[];
  network: NetworkInfo;
  sw: ServiceWorkerInfo;
  storage: StorageInfo;
  performance: PerformanceInfo;
  issues: DiagIssue[];
  overall: HealthLevel;
}

function keyBytes(key: string): number {
  try {
    const v = localStorage.getItem(key);
    return v ? v.length : 0;
  } catch {
    return 0;
  }
}

async function measureLatency(): Promise<{ ms: number | null; failed: boolean }> {
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(PING_PATH, { method: "GET", cache: "no-store", signal: controller.signal });
    return { ms: Math.round(performance.now() - start), failed: false };
  } catch {
    return { ms: null, failed: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeServiceWorker(engine: EngineInfo): Promise<ServiceWorkerInfo> {
  if (!("serviceWorker" in navigator)) {
    return { supported: false, matched: false, state: "unsupported", scriptURL: null, controlling: false, updateAvailable: false };
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  const reg = registrations.find((r) => r.scope.includes(engine.swScope));
  const controller = navigator.serviceWorker.controller;
  if (!reg) {
    return { supported: true, matched: false, state: "none", scriptURL: null, controlling: !!controller, updateAvailable: false };
  }
  const state: SWState = reg.active ? "activated" : reg.installing ? "installing" : reg.waiting ? "waiting" : "none";
  const scriptURL = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? null;
  return {
    supported: true,
    matched: true,
    state,
    scriptURL,
    controlling: !!controller && !!scriptURL && controller.scriptURL === scriptURL,
    updateAvailable: !!reg.waiting,
  };
}

async function probeStorage(): Promise<{ usageBytes: number | null; quotaBytes: number | null; supported: boolean }> {
  if (!navigator.storage?.estimate) return { usageBytes: null, quotaBytes: null, supported: false };
  try {
    const est = await navigator.storage.estimate();
    return { usageBytes: est.usage ?? null, quotaBytes: est.quota ?? null, supported: true };
  } catch {
    return { usageBytes: null, quotaBytes: null, supported: false };
  }
}

function computeStorageBreakdown(bookmarks: unknown[]): { items: StorageBreakdownItem[]; measured: number } {
  const settingsRaw = (() => {
    try {
      return localStorage.getItem(SETTINGS_KEY) || "";
    } catch {
      return "";
    }
  })();
  const bookmarksBytes = JSON.stringify(bookmarks || []).length;
  const otherSettingsBytes = Math.max(0, settingsRaw.length - bookmarksBytes);
  const items: StorageBreakdownItem[] = [
    { label: "History", bytes: keyBytes(HISTORY_KEY) },
    { label: "Sessions", bytes: keyBytes(SESSION_KEY) },
    { label: "Bookmarks", bytes: bookmarksBytes },
    { label: "Themes", bytes: keyBytes(CUSTOM_THEMES_KEY) },
    { label: "Notes", bytes: keyBytes(NOTES_KEY) },
    { label: "Widgets", bytes: keyBytes(WEATHER_KEY) + keyBytes(TODOS_KEY) + keyBytes(SHORTCUTS_KEY) },
    { label: "Other", bytes: keyBytes(WALLPAPER_KEY) + keyBytes(TOOLBAR_KEY) + otherSettingsBytes },
  ];
  const measured = items.reduce((sum, i) => sum + i.bytes, 0);
  return { items, measured };
}

function getAnimationMode(): "full" | "reduced" | "none" {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return "none";
  const attr = document.documentElement.getAttribute("data-anim");
  if (attr === "reduced") return "reduced";
  if (attr === "none") return "none";
  return "full";
}

function getStartupMs(): number | null {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) return Math.max(0, Math.round(nav.domContentLoadedEventEnd));
    return null;
  } catch {
    return null;
  }
}

interface Probe {
  network: NetworkInfo;
  sw: ServiceWorkerInfo;
  storage: StorageInfo;
  memoryUsedMb: number | null;
  memoryLimitMb: number | null;
}

function emptyProbe(): Probe {
  return {
    network: { online: navigator.onLine, effectiveType: null, downlinkMbps: null, rttMs: null, saveData: false, latencyMs: null, latencyFailed: false },
    sw: { supported: "serviceWorker" in navigator, matched: false, state: "none", scriptURL: null, controlling: false, updateAvailable: false },
    storage: { supported: false, usageBytes: null, quotaBytes: null, breakdown: [] },
    memoryUsedMb: null,
    memoryLimitMb: null,
  };
}

async function runProbe(engine: EngineInfo, bookmarks: unknown[]): Promise<Probe> {
  const conn = (navigator as any).connection;
  const [latency, sw, storageEst] = await Promise.all([measureLatency(), probeServiceWorker(engine), probeStorage()]);
  const { items, measured } = computeStorageBreakdown(bookmarks);
  const cacheBytes = storageEst.usageBytes != null ? Math.max(0, storageEst.usageBytes - measured) : 0;
  const breakdown = [{ label: "Cache & offline data", bytes: cacheBytes }, ...items];
  const mem = (performance as any).memory;

  return {
    network: {
      online: navigator.onLine,
      effectiveType: conn?.effectiveType ?? null,
      downlinkMbps: typeof conn?.downlink === "number" ? conn.downlink : null,
      rttMs: typeof conn?.rtt === "number" ? conn.rtt : null,
      saveData: !!conn?.saveData,
      latencyMs: latency.ms,
      latencyFailed: latency.failed,
    },
    sw,
    storage: { supported: storageEst.supported, usageBytes: storageEst.usageBytes, quotaBytes: storageEst.quotaBytes, breakdown },
    memoryUsedMb: mem ? Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10 : null,
    memoryLimitMb: mem ? Math.round((mem.jsHeapSizeLimit / 1048576) * 10) / 10 : null,
  };
}

function computeIssues(d: {
  engine: EngineInfo;
  ctrlReady: boolean;
  status: string;
  statusWarn: boolean;
  network: NetworkInfo;
  sw: ServiceWorkerInfo;
  storage: StorageInfo;
}): DiagIssue[] {
  const issues: DiagIssue[] = [];
  if (!d.network.online) {
    issues.push({ level: "critical", text: "You're not connected to the internet right now." });
  } else if (d.statusWarn && !d.ctrlReady) {
    issues.push({ level: "critical", text: `The ${d.engine.name} engine couldn't start: ${d.status || "unknown error"}.` });
  } else if (!d.ctrlReady) {
    issues.push({ level: "warn", text: `${d.engine.name} is still starting up.` });
  }
  if (d.sw.supported && !d.sw.matched && d.ctrlReady) {
    issues.push({ level: "warn", text: "the service worker isn't registered. reload if pages fail." });
  }
  if (d.sw.updateAvailable) {
    issues.push({ level: "warn", text: "An update to Bardo is ready. Refresh to apply it." });
  }
  if (d.storage.usageBytes != null && d.storage.quotaBytes) {
    const ratio = d.storage.usageBytes / d.storage.quotaBytes;
    if (ratio > STORAGE_WARN_RATIO) {
      issues.push({ level: "warn", text: "Local storage is almost full. Clear some data to keep things running smoothly." });
    }
  }
  if (d.network.latencyMs != null && d.network.latencyMs > LATENCY_WARN_MS) {
    issues.push({ level: "warn", text: "Your connection to Bardo's server is slower than usual." });
  }
  return issues;
}

export function useDiagnostics(): DiagnosticsData {
  const core = useBardoSelector(
    (s) => ({
      engine: s.settings.engine,
      ctrlReady: s.ctrlReady,
      status: s.status,
      statusWarn: s.statusWarn,
      wispUrl: s.wispUrl,
      transport: s.transport,
      tabs: s.tabs,
      historyCount: s.history.length,
      bookmarks: s.settings.bookmarks,
      historyEnabled: s.settings.historyEnabled,
      bookmarksVisible: s.settings.bookmarksVisible,
      erudaEnabled: s.settings.erudaEnabled,
      toolbarCount: s.toolbar.length,
      widgetsActive:
        s.settings.widgetQuickLinks ||
        s.settings.widgetNotes ||
        s.settings.widgetWeather ||
        s.settings.widgetDate ||
        s.settings.widgetTodo ||
        s.settings.widgetPomodoro ||
        s.settings.widgetBattery,
    }),
    shallowEqual,
  );

  const log = useSyncExternalStore(subscribeDiagnostics, getDiagLog, getDiagLog);
  const restartInfo = useSyncExternalStore(subscribeDiagnostics, getEngineRestartInfo, getEngineRestartInfo);
  const lastConnectedAt = useSyncExternalStore(subscribeDiagnostics, getLastConnectedAt, getLastConnectedAt);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const [probe, setProbe] = useState<Probe>(emptyProbe);
  useEffect(() => {
    let cancelled = false;
    const engineInfo = ENGINE_BY_ID[core.engine] ?? ENGINES[0];
    const tick = () => {
      runProbe(engineInfo, core.bookmarks).then((result) => {
        if (!cancelled) setProbe(result);
      });
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [core.engine, core.bookmarks]);

  const engineInfo = ENGINE_BY_ID[core.engine] ?? ENGINES[0];
  const sleepingTabs = core.tabs.filter((t) => t.suspended).length;
  const performanceInfo: PerformanceInfo = {
    startupMs: getStartupMs(),
    memoryUsedMb: probe.memoryUsedMb,
    memoryLimitMb: probe.memoryLimitMb,
    animationMode: getAnimationMode(),
  };

  const issues = computeIssues({
    engine: engineInfo,
    ctrlReady: core.ctrlReady,
    status: core.status,
    statusWarn: core.statusWarn,
    network: probe.network,
    sw: probe.sw,
    storage: probe.storage,
  });
  const overall: HealthLevel = issues.some((i) => i.level === "critical") ? "critical" : issues.length ? "warn" : "ok";

  return {
    engine: engineInfo,
    ctrlReady: core.ctrlReady,
    status: core.status,
    statusWarn: core.statusWarn,
    wispUrl: core.wispUrl,
    transport: core.transport,
    tabs: core.tabs,
    sleepingTabs,
    historyCount: core.historyCount,
    bookmarksCount: core.bookmarks.length,
    historyEnabled: core.historyEnabled,
    bookmarksVisible: core.bookmarksVisible,
    widgetsActive: core.widgetsActive,
    erudaEnabled: core.erudaEnabled,
    toolbarCount: core.toolbarCount,
    restartInfo,
    lastConnectedAt,
    sessionDurationMs: Math.max(0, now - SESSION_START),
    log,
    network: probe.network,
    sw: probe.sw,
    storage: probe.storage,
    performance: performanceInfo,
    issues,
    overall,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatRelativeTime(ts: number | null, now: number = Date.now()): string {
  if (ts == null) return "Never";
  const diff = Math.max(0, now - ts);
  if (diff < 10000) return "Just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}
