// Lightweight, self-contained store backing the Diagnostics page: a small
// event log ring buffer plus a couple of persisted counters. Deliberately has
// no dependency on core.ts (core.ts depends on this module, not vice versa).

export type DiagLevel = "info" | "success" | "warn" | "error";

export interface DiagLogEntry {
  id: number;
  ts: number;
  message: string;
  level: DiagLevel;
}

const LOG_KEY = "bardo-diagnostics-log";
const RESTART_KEY = "bardo-engine-restarts";
const LAST_CONNECTED_KEY = "bardo-last-connected";
const LOG_MAX = 40;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

const DIAG_LEVELS: DiagLevel[] = ["info", "success", "warn", "error"];

function isDiagLogEntry(e: unknown): e is DiagLogEntry {
  if (!e || typeof e !== "object") return false;
  const entry = e as Record<string, unknown>;
  return (
    typeof entry.id === "number" &&
    typeof entry.ts === "number" &&
    typeof entry.message === "string" &&
    typeof entry.level === "string" &&
    (DIAG_LEVELS as string[]).includes(entry.level)
  );
}

function loadLog(): DiagLogEntry[] {
  const raw = readJSON<unknown>(LOG_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isDiagLogEntry).slice(-LOG_MAX);
}

let log: DiagLogEntry[] = loadLog();
let nextId = log.reduce((max, e) => Math.max(max, e.id), 0) + 1;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

/** Fires on any change to the log, restart counter, or last-connected time. */
export function subscribeDiagnostics(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getDiagLog(): DiagLogEntry[] {
  return log;
}

export function logEvent(message: string, level: DiagLevel = "info") {
  log = [...log, { id: nextId++, ts: Date.now(), message, level }].slice(-LOG_MAX);
  writeJSON(LOG_KEY, log);
  emit();
}

export interface EngineRestartInfo {
  count: number;
  lastAt: number | null;
}

let restartInfo: EngineRestartInfo = readJSON(RESTART_KEY, { count: 0, lastAt: null });

export function getEngineRestartInfo(): EngineRestartInfo {
  return restartInfo;
}

export function recordEngineRestart() {
  restartInfo = { count: restartInfo.count + 1, lastAt: Date.now() };
  writeJSON(RESTART_KEY, restartInfo);
  emit();
}

let lastConnectedAt: number | null = readJSON(LAST_CONNECTED_KEY, null);

export function getLastConnectedAt(): number | null {
  return lastConnectedAt;
}

/** Called once the active proxy engine's controller finishes initializing. */
export function recordConnectionSuccess(engineLabel: string) {
  lastConnectedAt = Date.now();
  writeJSON(LAST_CONNECTED_KEY, lastConnectedAt);
  logEvent(`Connected using ${engineLabel}`, "success");
}

/** Timestamp this module (and therefore this browsing session) started. */
export const SESSION_START = Date.now();
