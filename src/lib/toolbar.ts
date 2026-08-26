import type { IconName } from "@/components/icons";
import { TOOLBAR_KEY } from "./constants";
import { PANE_BY_ID, PINNABLE_PANES, type PaneId } from "./panes";

export type ToolbarActionId =
  | "back"
  | "forward"
  | "reload"
  | "home"
  | "address"
  | "copy-link"
  | "fullscreen"
  | "aboutblank"
  | "history"
  | "bookmarks"
  | "shortcuts"
  | "settings"
  | "new-tab"
  | "tab-switcher"
  | "sidebar-toggle"
  | "separator"
  | "spacer";

export type ToolbarItemId = ToolbarActionId | `pane:${PaneId}`;

export interface ToolbarEntry {
  id: ToolbarItemId;
  /** Stable render key; separators and spacers can repeat. */
  key: string;
}

export interface ToolbarItemDef {
  id: ToolbarItemId;
  label: string;
  icon: IconName | null;
  hint?: string;
  allowDuplicates?: boolean;
  /** Popover pane for pinned settings sections. */
  pane?: PaneId;
}

const ACTION_DEFS: ToolbarItemDef[] = [
  { id: "back", label: "back", icon: "arrow-left" },
  { id: "forward", label: "forward", icon: "arrow-right" },
  { id: "reload", label: "reload", icon: "refresh-ccw" },
  { id: "home", label: "home", icon: "home" },
  { id: "address", label: "address bar", icon: "search", hint: "search or type a url" },
  { id: "copy-link", label: "copy link", icon: "copy" },
  { id: "fullscreen", label: "fullscreen", icon: "maximize-2" },
  { id: "aboutblank", label: "about:blank", icon: "eye", hint: "open bardo in a blank tab" },
  { id: "history", label: "history", icon: "history" },
  { id: "bookmarks", label: "bookmark", icon: "bookmark", hint: "save this page" },
  { id: "shortcuts", label: "shortcuts", icon: "grip" },
  { id: "settings", label: "settings", icon: "settings" },
  { id: "new-tab", label: "new tab", icon: "plus" },
  { id: "tab-switcher", label: "tab switcher", icon: "layout-grid" },
  { id: "sidebar-toggle", label: "sidebar", icon: "panel-left-close", hint: "shows with side tabs" },
  { id: "separator", label: "separator", icon: null, allowDuplicates: true },
  { id: "spacer", label: "spacer", icon: null, hint: "pushes stuff apart", allowDuplicates: true },
];

const PANE_DEFS: ToolbarItemDef[] = PINNABLE_PANES.map((p) => ({
  id: `pane:${p.id}` as ToolbarItemId,
  label: p.label,
  icon: p.icon,
  hint: p.desc,
  pane: p.id,
}));

export const TOOLBAR_ITEMS: ToolbarItemDef[] = [...ACTION_DEFS, ...PANE_DEFS];

export const TOOLBAR_ITEM_BY_ID = new Map(TOOLBAR_ITEMS.map((d) => [d.id, d]));

export const DEFAULT_TOOLBAR: ToolbarItemId[] = [
  "sidebar-toggle",
  "back",
  "forward",
  "reload",
  "home",
  "address",
  "copy-link",
  "fullscreen",
  "history",
  "shortcuts",
  "settings",
];

interface StoredToolbarV1 {
  version: 1;
  items: string[];
}

let keyCounter = 0;

export function toEntries(ids: ToolbarItemId[]): ToolbarEntry[] {
  return ids.map((id) => ({ id, key: `${id}#${keyCounter++}` }));
}

export function makeEntry(id: ToolbarItemId): ToolbarEntry {
  return { id, key: `${id}#${keyCounter++}` };
}

export function sanitizeToolbarIds(raw: unknown): ToolbarItemId[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const items: ToolbarItemId[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const def = TOOLBAR_ITEM_BY_ID.get(value as ToolbarItemId);
    if (!def) continue;
    if (!def.allowDuplicates) {
      if (seen.has(def.id)) continue;
      seen.add(def.id);
    }
    items.push(def.id);
  }
  if (items.length === 0 || items.length > 64) return null;
  return items;
}

export function loadToolbar(): ToolbarItemId[] {
  try {
    const raw = localStorage.getItem(TOOLBAR_KEY);
    if (!raw) return [...DEFAULT_TOOLBAR];
    const data = JSON.parse(raw) as Partial<StoredToolbarV1> | null;
    if (!data || data.version !== 1) return [...DEFAULT_TOOLBAR];
    return sanitizeToolbarIds(data.items) ?? [...DEFAULT_TOOLBAR];
  } catch {
    return [...DEFAULT_TOOLBAR];
  }
}

export function saveToolbar(ids: ToolbarItemId[]): boolean {
  try {
    const stored: StoredToolbarV1 = { version: 1, items: ids };
    localStorage.setItem(TOOLBAR_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function paneOf(id: ToolbarItemId): PaneId | null {
  return id.startsWith("pane:") ? (id.slice(5) as PaneId) : null;
}

export function toolbarItemLabel(id: ToolbarItemId): string {
  const pane = paneOf(id);
  if (pane) return PANE_BY_ID[pane]?.label ?? id;
  return TOOLBAR_ITEM_BY_ID.get(id)?.label ?? id;
}
